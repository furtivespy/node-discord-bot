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

function closeSuffix(fence, body) {
  if (!fence) return "";
  return body.endsWith("\n") ? fence.ticks : `\n${fence.ticks}`;
}

function maxCloserLen(fence) {
  return fence ? fence.ticks.length + 1 : 0;
}

function emitChunk(prefix, body, closeFence) {
  // Keep fence body intact (blank lines, indentation). Trim only prose cuts.
  const payload = closeFence ? body : body.trimEnd();
  const closer = closeFence ? closeSuffix(closeFence, payload) : "";
  return prefix + payload + closer;
}

function isFenceWrapperOnly(body) {
  if (body.length === 0) return false;
  const lines = body.split("\n");
  let sawFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (parseFenceLine(line)) {
      sawFence = true;
      continue;
    }
    if (line === "" && i === lines.length - 1 && body.endsWith("\n")) continue;
    return false;
  }
  return sawFence;
}

function takeChunk(remaining, inheritedFence, limit) {
  const prefix = openPrefix(inheritedFence);

  const build = (take) => {
    const safeTake = Math.max(0, Math.min(take, remaining.length));
    const body = remaining.slice(0, safeTake);
    const fence = fenceAfter(body, inheritedFence);
    const chunk = emitChunk(prefix, body, fence);
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

  if (result.chunk.length > limit && result.fence) {
    result = build(cutForRoom(roomFor(result.fence)));
  }

  for (let i = 0; i < 8; i++) {
    if (!isFenceWrapperOnly(remaining.slice(0, result.take))) break;
    if (result.take >= remaining.length) break;
    const fenceGuess = result.fence || inheritedFence;
    if (roomFor(fenceGuess) <= result.take) {
      return raw(limit);
    }
    const nextTake = cutForRoom(roomFor(fenceGuess), result.take);
    if (nextTake <= result.take) break;
    result = build(nextTake);
  }

  while (result.chunk.length > limit && result.take > 1) {
    const overflow = result.chunk.length - limit;
    const reduced = Math.max(1, result.take - overflow);
    const recut = findCutIndex(remaining, reduced);
    const nextTake = recut > 0 && recut < result.take ? recut : reduced;
    result = build(nextTake >= result.take ? result.take - 1 : nextTake);
  }

  if (result.chunk.length > limit) {
    return raw(limit);
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
