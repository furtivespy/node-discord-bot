// Detects the image-gen marker the model is instructed to emit, extracts the
// prompt for generateImageNew, and strips the callout from user-visible text.

const MARKER_RE = /(?:processing|generating|generate|creating|create)\s+(?:an?\s+)?image\s+of/i;

// Spoken lead-in immediately before the marker: "I'm", "I'll", "gonna", etc.
const PREFIX_RE =
  /(?:(?:I(?:['’]m| am|['’]ll| will)|let(?:'s| us| me)|here(?:'s| is))\s+)?(?:(?:also|then|just|now|gonna|going to)\s+)*$/i;

// Conjunctions joining the callout onto the previous sentence: "and then also"
const CONNECTOR_RE = /(?:[,;:]?\s*(?:and|then|also|plus)\s*)+$/i;

function locateCallout(text) {
  const markerMatch = MARKER_RE.exec(text);
  if (!markerMatch) return null;

  const markerStart = markerMatch.index;
  const markerEnd = markerStart + markerMatch[0].length;

  const before = text.slice(0, markerStart);
  const prefixMatch = before.match(PREFIX_RE);
  let start = markerStart - (prefixMatch ? prefixMatch[0].length : 0);

  const connectorMatch = text.slice(0, start).match(CONNECTOR_RE);
  if (connectorMatch) start -= connectorMatch[0].length;

  const afterMarker = text.slice(markerEnd);
  const promptMatch = afterMarker.match(/^[ \t]*(.*?)[ \t]*(?=\n|\|\|SEPARATE\|\||$)/);
  const prompt = (promptMatch ? promptMatch[1] : "").trim().replace(/[.,;:]+$/, "").trim();
  const consumed = promptMatch ? promptMatch[0].length : 0;

  return { start, end: markerEnd + consumed, prompt };
}

function cleanupReplyText(text) {
  let cleaned = text
    .replace(/(?:\|\|SEPARATE\|\|){2,}/g, "||SEPARATE||")
    .replace(/^\s*\|\|SEPARATE\|\|/, "")
    .replace(/\|\|SEPARATE\|\|\s*$/, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/(?:[,;:]?\s+(?:and|then|also|plus))+\s*$/i, "")
    .replace(/[,:;]\s*$/g, "")
    .trim();

  cleaned = cleaned.replace(/(?:\|\|SEPARATE\|\|){2,}/g, "||SEPARATE||");
  cleaned = cleaned.replace(/^\s*\|\|SEPARATE\|\|/, "").replace(/\|\|SEPARATE\|\|\s*$/, "").trim();
  return cleaned;
}

function extractImageCallout(text) {
  if (typeof text !== "string" || !text) {
    return { text: text || "", imagePrompt: null };
  }

  let imagePrompt = null;
  let remaining = text;
  for (let i = 0; i < 5; i++) {
    const match = locateCallout(remaining);
    if (!match) break;
    if (!imagePrompt && match.prompt) imagePrompt = match.prompt;
    remaining = remaining.slice(0, match.start) + remaining.slice(match.end);
  }

  return { text: cleanupReplyText(remaining), imagePrompt };
}

module.exports = { extractImageCallout };
