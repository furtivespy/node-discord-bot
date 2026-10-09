// Safety-net splitter for Gemini replies that ignored ||SEPARATE|| chunking.
// Discord message content is capped at 2000 characters.

export const DISCORD_CONTENT_LIMIT = 2000;

const FENCE_LINE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const SENTENCE_ENDS = [". ", "! ", "? "];

function parseFenceLine(line) {
  const match = FENCE_LINE.exec(line);
  if (!match) return null;
  const ticks = match[2];
  return {
    char: ticks[0],
    length: ticks.length,
    info: match[3].trim(),
  };
}

function openingFence(parsed) {
  const lang = parsed.info.split(/\s+/)[0] || "";
  return {
    ticks: parsed.char.repeat(parsed.length),
    lang,
  };
}

function applyFenceLine(line, fence) {
  const parsed = parseFenceLine(line);
  if (!parsed) return fence;
  if (!fence) return openingFence(parsed);
  if (
    parsed.char === fence.ticks[0] &&
    parsed.length >= fence.ticks.length &&
    parsed.info === ""
  ) {
    return null;
  }
  return fence;
}

function fenceAfter(text, initialFence = null) {
  let fence = initialFence;
  for (const line of text.split("\n")) {
    fence = applyFenceLine(line, fence);
  }
  return fence;
}

function lastSentenceEnd(window) {
  let best = -1;
  for (const token of SENTENCE_ENDS) {
    const idx = window.lastIndexOf(token);
    if (idx > 0) best = Math.max(best, idx + token.length);
  }
  return best;
}

function findCutIndex(text, limit) {
  if (limit <= 0) return 0;
  if (text.length <= limit) return text.length;
  const window = text.slice(0, limit);

  const blank = window.lastIndexOf("\n\n");
  if (blank > 0) return blank + 2;

  const newline = window.lastIndexOf("\n");
  if (newline > 0) return newline + 1;

  const sentence = lastSentenceEnd(window);
  if (sentence > 0) return sentence;

  const space = window.lastIndexOf(" ");
  if (space > 0) return space + 1;

  return limit;
}

function openPrefix(fence) {
  if (!fence) return "";
  return `${fence.ticks}${fence.lang}\n`;
}

function closeSuffix(fence) {
  if (!fence) return "";
  // Always put the closer on its own line so Discord treats it as a fence.
  // The leading newline is wrapper, not source: unwrap strips `\n``` `.
  return `\n${fence.ticks}`;
}

function maxCloserLen(fence) {
  return fence ? fence.ticks.length + 1 : 0;
}

// If this take would close an open fence that has no non-whitespace code body,
// return the opener index in `body` (0 at start of body; -1 if inherited).
// Return null when the cut is fine.
function emptyOpenFenceOpenerIndex(body, inheritedFence) {
  let fence = inheritedFence;
  let openerIndex = inheritedFence ? -1 : null;
  let hasBody = !inheritedFence;
  let offset = 0;
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextFence = applyFenceLine(line, fence);
    if (!fence && nextFence) {
      openerIndex = offset;
      hasBody = false;
    } else if (fence && !nextFence) {
      openerIndex = null;
      hasBody = true;
    } else if (nextFence && line.trim() !== "") {
      hasBody = true;
    }
    fence = nextFence;
    offset += line.length;
    if (i < lines.length - 1) offset += 1;
  }
  if (fence && !hasBody) return openerIndex;
  return null;
}

function takeChunk(remaining, inheritedFence, limit) {
  const prefix = openPrefix(inheritedFence);

  const build = (take, { keepNewlineBeforeOpener = false } = {}) => {
    const safeTake = Math.max(0, Math.min(take, remaining.length));
    const body = remaining.slice(0, safeTake);
    const fence = fenceAfter(body, inheritedFence);
    const payload = fence
      ? body
      : keepNewlineBeforeOpener
        ? body.replace(/[ \t]+$/, "")
        : body.trimEnd();
    const closer = fence ? closeSuffix(fence) : "";
    const chunk = prefix + payload + closer;
    return { take: safeTake, fence, chunk };
  };

  const raw = (take) => {
    const safeTake = Math.max(1, Math.min(take, remaining.length));
    const body = remaining.slice(0, safeTake);
    return { take: safeTake, fence: fenceAfter(body, inheritedFence), chunk: body };
  };

  const whole = build(remaining.length);
  if (whole.chunk.length <= limit) return whole;

  const roomFor = (fence) => limit - prefix.length - maxCloserLen(fence);

  // Prefix + closer leave no room for body: send source text so take matches
  // what was emitted. Never slice the wrapped chunk independently of take.
  if (roomFor(inheritedFence) <= 0) {
    return raw(limit);
  }

  const cutForRoom = (room, minTake = 0) => {
    const budget = Math.max(minTake > 0 ? minTake + 1 : 0, room);
    const windowLimit = Math.max(1, budget - minTake);
    const extra = findCutIndex(remaining.slice(minTake), windowLimit);
    if (extra < 1) {
      return Math.min(Math.max(budget, minTake + 1), remaining.length);
    }
    return minTake + extra;
  };

  let result = build(cutForRoom(roomFor(inheritedFence)));

  const emptyOpenerAt = (take) =>
    emptyOpenFenceOpenerIndex(remaining.slice(0, take), inheritedFence);

  // Empty open fence: move the cut before the opener when that leaves a
  // previous chunk, otherwise keep taking until this chunk has body.
  // Do this before shrinking for closer overflow, or findCutIndex can land
  // on the same newline and trimEnd the line-break before the fence.
  const openerAt = emptyOpenerAt(result.take);
  if (openerAt !== null && openerAt > 0) {
    result = build(openerAt, { keepNewlineBeforeOpener: true });
  }

  if (result.chunk.length > limit && result.fence) {
    result = build(cutForRoom(roomFor(result.fence)));
    const recutOpener = emptyOpenerAt(result.take);
    if (recutOpener !== null && recutOpener > 0) {
      result = build(recutOpener, { keepNewlineBeforeOpener: true });
    }
  }

  for (let i = 0; i < 8; i++) {
    if (emptyOpenerAt(result.take) === null) break;
    if (result.take >= remaining.length) break;
    const fenceGuess = result.fence || inheritedFence;
    if (roomFor(fenceGuess) <= result.take) {
      return raw(limit);
    }
    const nextTake = cutForRoom(roomFor(fenceGuess), result.take);
    if (nextTake <= result.take) {
      const hard = Math.min(remaining.length, result.take + 1);
      const hardResult = build(hard);
      if (hard > result.take && hardResult.chunk.length <= limit) {
        result = hardResult;
        continue;
      }
      break;
    }
    result = build(nextTake);
  }

  while (result.chunk.length > limit && result.take > 1) {
    const overflow = result.chunk.length - limit;
    const reduced = Math.max(1, result.take - overflow);
    const recut = findCutIndex(remaining, reduced);
    let nextTake = recut > 0 && recut < result.take ? recut : reduced;
    if (nextTake >= result.take) nextTake = result.take - 1;
    // Don't recut onto an empty open fence; keep the body that overflowed.
    if (emptyOpenerAt(nextTake) !== null) {
      nextTake = reduced < result.take ? reduced : result.take - 1;
    }
    const recutOpener = emptyOpenerAt(nextTake);
    result =
      recutOpener !== null && recutOpener > 0
        ? build(recutOpener, { keepNewlineBeforeOpener: true })
        : build(nextTake);
  }

  if (result.chunk.length > limit) {
    return raw(limit);
  }

  const stillEmpty = emptyOpenerAt(result.take);
  if (stillEmpty !== null && stillEmpty > 0) {
    return build(stillEmpty, { keepNewlineBeforeOpener: true });
  }
  return result;
}

/**
 * Split `text` into Discord-safe chunks.
 * Over-long input is cut at the best boundary at or before `limit`
 * (blank line, newline, sentence end, last space, then a hard cut).
 * Cuts inside an open markdown code fence close the fence on this chunk
 * and reopen it with the same language tag on the next.
 *
 * @param {string} text
 * @param {number} [limit=2000]
 * @returns {string[]}
 */
export function splitForDiscord(text, limit = DISCORD_CONTENT_LIMIT) {
  if (typeof text !== "string" || text.length === 0) return [];
  if (text.trim().length === 0) return [];
  if (text.length <= limit) return [text];

  const maxLen = Math.max(1, limit);
  const chunks = [];
  let remaining = text;
  let inheritedFence = null;
  let guard = text.length + 4;

  while (remaining.length > 0 && guard-- > 0) {
    const before = remaining.length;
    const { take, fence, chunk } = takeChunk(remaining, inheritedFence, maxLen);
    if (chunk.trim().length > 0) chunks.push(chunk);

    remaining = remaining.slice(Math.max(take, 1));
    if (!fence) remaining = remaining.trimStart();
    inheritedFence = fence;

    if (remaining.length >= before) break;
  }

  return chunks;
}
