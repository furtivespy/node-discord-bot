import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitForDiscord, DISCORD_CONTENT_LIMIT } from "../modules/splitForDiscord.js";

function wordsOf(text) {
  return text.split(/\s+/).filter(Boolean);
}

function assertWithinLimit(chunks, limit = DISCORD_CONTENT_LIMIT) {
  assert.ok(chunks.length > 0, "expected at least one chunk");
  for (const [i, chunk] of chunks.entries()) {
    assert.ok(
      chunk.length <= limit,
      `chunk ${i} is ${chunk.length} chars, over the ${limit} limit`
    );
  }
}

describe("splitForDiscord", () => {
  it("returns an empty array for empty input", () => {
    assert.deepEqual(splitForDiscord(""), []);
    assert.deepEqual(splitForDiscord(null), []);
    assert.deepEqual(splitForDiscord(undefined), []);
  });

  it("returns an empty array for a whitespace-only chunk", () => {
    assert.deepEqual(splitForDiscord("   \n\t  "), []);
    assert.deepEqual(splitForDiscord("\n\n"), []);
  });

  it("returns a chunk exactly at the limit unchanged", () => {
    const text = "a".repeat(DISCORD_CONTENT_LIMIT);
    assert.equal(text.length, DISCORD_CONTENT_LIMIT);
    assert.deepEqual(splitForDiscord(text), [text]);
  });

  it("returns a short chunk unchanged", () => {
    const text = "Hello meatbag.";
    assert.deepEqual(splitForDiscord(text), [text]);
  });

  it("splits a 5000-char reply with no separators into 3 messages without losing text", () => {
    const text = "word ".repeat(1000);
    assert.equal(text.length, 5000);

    const chunks = splitForDiscord(text);
    assert.equal(chunks.length, 3);
    assertWithinLimit(chunks);
    assert.deepEqual(wordsOf(chunks.join(" ")), wordsOf(text));
    assert.ok(
      chunks.every((chunk) => wordsOf(chunk).every((word) => word === "word")),
      "expected cuts at a space or better, not a mid-word hard cut"
    );
  });

  it("splits only the over-long ||SEPARATE|| part and keeps short parts intact", () => {
    const short = "Short idea.";
    const long = "word ".repeat(600);
    const tail = "Closing thought.";
    assert.equal(long.length, 3000);

    const parts = [short, long, tail];
    const sent = parts.flatMap((part) => splitForDiscord(part));

    assert.deepEqual(splitForDiscord(short), [short]);
    assert.deepEqual(splitForDiscord(tail), [tail]);
    assert.ok(splitForDiscord(long).length >= 2);
    assert.equal(sent[0], short);
    assert.equal(sent.at(-1), tail);
    assert.deepEqual(wordsOf(sent.join(" ")), wordsOf(parts.join(" ")));
    assertWithinLimit(sent);
  });

  it("closes and reopens a code fence when a cut lands inside the block", () => {
    const line = "const value = 1; // comment on this line of sample code\n";
    const text = `Intro paragraph.\n\n\`\`\`js\n${line.repeat(80)}\`\`\`\n\nOutro.`;
    assert.ok(text.length > DISCORD_CONTENT_LIMIT * 2);

    const chunks = splitForDiscord(text);
    assert.ok(chunks.length >= 2);
    assertWithinLimit(chunks);

    const fenceSplitAt = chunks.findIndex(
      (chunk, i) =>
        i < chunks.length - 1 &&
        chunk.includes("```js") &&
        /```\s*$/.test(chunk) &&
        chunks[i + 1].startsWith("```js")
    );
    assert.ok(fenceSplitAt >= 0, "expected a cut inside the js fence to close and reopen");
    assert.ok(chunks[fenceSplitAt].includes("const value"));
    assert.ok(chunks[fenceSplitAt + 1].includes("const value"));
    assert.equal(
      (chunks.join("").match(/const value/g) || []).length,
      (text.match(/const value/g) || []).length
    );
    assert.match(chunks[0], /Intro paragraph/);
    assert.match(chunks.at(-1), /Outro/);
  });

  it("hard-cuts a no-space string over 2000 characters without dropping text", () => {
    const text = "A".repeat(4500);
    const chunks = splitForDiscord(text);
    assert.ok(chunks.length >= 3);
    assertWithinLimit(chunks);
    assert.equal(chunks.join(""), text);
    assert.equal(chunks[0].length, DISCORD_CONTENT_LIMIT);
  });

  it("prefers a blank line over a later newline or space", () => {
    const text = `alpha\n\nbravo\ncharlie ${"x".repeat(40)}`;
    const chunks = splitForDiscord(text, 30);
    assert.equal(chunks[0], "alpha");
    assert.ok(chunks.join(" ").includes("bravo"));
    assert.ok(chunks.join(" ").includes("charlie"));
    assertWithinLimit(chunks, 30);
  });

  it("prefers a sentence end over a later space", () => {
    const text = `Hello world. More ${"words ".repeat(20)}`;
    const chunks = splitForDiscord(text, 20);
    assert.equal(chunks[0], "Hello world.");
    assertWithinLimit(chunks, 20);
  });

  it("keeps final chunks within 2000 after a replacement that lengthens the text", () => {
    const mention = "<@123456789012345678>";
    const nick = "SupercalifragilisticDisplayName";
    const replaced = `${mention} `.repeat(80).replaceAll(mention, nick);
    assert.ok(replaced.length > DISCORD_CONTENT_LIMIT);
    const chunks = splitForDiscord(replaced);
    assertWithinLimit(chunks);
    assert.deepEqual(wordsOf(chunks.join(" ")), wordsOf(replaced));
  });
});
