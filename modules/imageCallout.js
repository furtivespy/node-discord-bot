// Detects the image-gen marker the model is instructed to emit, extracts the
// prompt for generateImageNew, and strips the callout from user-visible text.

// Instructed Generating/Processing markers plus the ticket's spoken
// "generate an image of". Word-bounded so "recreate" etc. do not match.
// "create"/"creating" are omitted: conversational "create an image of" is not a callout.
const MARKER_RE = /\b(?:processing|generating|generate)\s+(?:an?\s+)?image\s+of\b/i;

// Spoken lead-in immediately before the marker: "I'm", "I'll", "gonna", etc.
const PREFIX_RE =
  /(?:(?:\bI(?:['’]m| am|['’]ll| will)|\blet(?:'s| us| me)|\bhere(?:'s| is))\s+)?(?:(?:also|then|just|now|gonna|going to)\s+)*$/i;

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

function collapseSeparates(text) {
  return text
    .replace(/(?:\|\|SEPARATE\|\|){2,}/g, "||SEPARATE||")
    .replace(/^\s*\|\|SEPARATE\|\|/, "")
    .replace(/\|\|SEPARATE\|\|\s*$/, "");
}

function cleanupReplyText(text) {
  let cleaned = collapseSeparates(text)
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/(?:[,;:]?\s+(?:and|then|also|plus))+\s*$/i, "")
    .replace(/[,:;]\s*$/g, "")
    .trim();

  return collapseSeparates(cleaned).trim();
}

function extractImageCallout(text) {
  if (typeof text !== "string" || !text) {
    return { text: text || "", imagePrompt: null };
  }

  let imagePrompt = null;
  let remaining = text;
  let foundMarker = false;

  // Strip every callout. A capped loop would leave later markers in Discord.
  while (true) {
    const match = locateCallout(remaining);
    if (!match) break;
    foundMarker = true;
    if (!imagePrompt && match.prompt) imagePrompt = match.prompt;
    remaining = remaining.slice(0, match.start) + remaining.slice(match.end);
  }

  if (!foundMarker) {
    return { text, imagePrompt: null };
  }

  const cleaned = cleanupReplyText(remaining);
  // Empty marker with no leftover text would otherwise post nothing and generate nothing.
  if (!cleaned && !imagePrompt) {
    return { text, imagePrompt: null };
  }

  return { text: cleaned, imagePrompt };
}

export { extractImageCallout };
