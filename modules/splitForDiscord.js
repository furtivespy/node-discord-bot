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
  const lines = text.split("\n");
  const completeCount = text.endsWith("\n") ? lines.length : lines.length - 1;
  for (let i = 0; i < completeCount; i++) {
    fence = applyFenceLine(lines[i], fence);
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

function emitChunk(prefix, body, closeFence) {
  const trimmed = body.trimEnd();
  const closer = closeFence ? closeSuffix(closeFence, trimmed) : "";
  return prefix + trimmed + closer;
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

  const whole = build(remaining.length);
  if (whole.chunk.length <= limit) return whole;

  const maxRaw = Math.max(1, limit - prefix.length);
  let take = findCutIndex(remaining, maxRaw);
  if (take < 1) take = Math.min(maxRaw, remaining.length);
  let result = build(take);

  while (result.chunk.length > limit && result.take > 1) {
    const overflow = result.chunk.length - limit;
    const reduced = Math.max(1, result.take - overflow);
    const recut = findCutIndex(remaining, reduced);
    const nextTake = recut > 0 && recut < result.take ? recut : reduced;
    if (nextTake >= result.take) {
      result = build(result.take - 1);
    } else {
      result = build(nextTake);
    }
  }

  if (result.chunk.length > limit) {
    return { ...result, chunk: result.chunk.slice(0, limit) };
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

    remaining = remaining.slice(Math.max(take, 1)).trimStart();
    inheritedFence = fence;

    if (remaining.length >= before) break;
  }

  return chunks;
}
