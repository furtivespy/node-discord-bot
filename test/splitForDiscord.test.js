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

function openerLang(chunk) {
  const open = /^(`{3,}|~{3,})(\S*)[^\n]*\n/.exec(chunk);
  return open ? open[2] : null;
}

function nonFenceLines(text) {
  return text.split("\n").filter((line) => !/^( {0,3})(`{3,}|~{3,})/.test(line));
}

function unwrapFenceContinuations(chunks) {
  if (chunks.length === 0) return "";
  // Strip only the closer ticks; a preceding newline is source text when the
  // cut landed on a line boundary (closeSuffix then emits ticks with no extra \n).
  const closeRe = /(`{3,}|~{3,})\s*$/;
  const openRe = /^(`{3,}|~{3,})[^\n]*\n/;
  let out = chunks[0];
  let lang = openerLang(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    const curr = chunks[i];
    const currLang = openerLang(curr);
    const close = closeRe.exec(out);
    const open = openRe.exec(curr);
    if (close && open && currLang === lang && lang !== null) {
      out = out.slice(0, close.index) + curr.slice(open[0].length);
    } else {
      out += curr;
      if (currLang !== null) lang = currLang;
    }
  }
  return out;
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
    assert.equal(chunks.join("").replaceAll(" ", ""), text.replaceAll(" ", ""));
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
    assert.equal(sent.join("").replaceAll(" ", ""), parts.join("").replaceAll(" ", ""));
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

  it("does not double-close a fence that ends with ``` and no trailing newline", () => {
    const line = "const value = 1; // comment on this line of sample code\n";
    const text = `\`\`\`js\n${line.repeat(80)}\`\`\``;
    assert.ok(text.length > DISCORD_CONTENT_LIMIT);
    assert.equal(text.endsWith("\n"), false);

    const chunks = splitForDiscord(text);
    assert.ok(chunks.length >= 2);
    assertWithinLimit(chunks);
    assert.equal(
      chunks.at(-1).endsWith("```\n```"),
      false,
      "last chunk must not append a second closer"
    );
    assert.match(chunks.at(-1), /```$/);
    assert.equal(unwrapFenceContinuations(chunks), text);
  });

  it("splits two sequential fences across chunks without doubling closers", () => {
    const jsLine = "const value = 1; // javascript sample line\n";
    const pyLine = "value = 1  # python sample line here\n";
    const text = `\`\`\`js\n${jsLine.repeat(80)}\`\`\`\n\`\`\`py\n${pyLine.repeat(80)}\`\`\``;
    assert.ok(text.length > DISCORD_CONTENT_LIMIT * 2);

    const chunks = splitForDiscord(text);
    assert.ok(chunks.length >= 3);
    assertWithinLimit(chunks);
    for (const [i, chunk] of chunks.entries()) {
      assert.equal(
        /\n```\n```$/.test(chunk),
        false,
        `chunk ${i} ends with a doubled closer`
      );
    }
    assert.ok(chunks.some((chunk) => chunk.includes("```js")));
    assert.ok(chunks.some((chunk) => chunk.includes("```py")));
    assert.deepEqual(nonFenceLines(chunks.join("")), nonFenceLines(text));
  });

  it("does not emit an empty first message for ```js\\n plus a 3000-char first code line", () => {
    const text = "```js\n" + "x".repeat(3000) + "\n```";
    const chunks = splitForDiscord(text);
    assert.ok(chunks.length >= 2);
    assertWithinLimit(chunks);
    assert.notEqual(chunks[0], "```js\n```");
    assert.ok(chunks[0].includes("x"), "first chunk should contain code, not an empty fence");
    assert.equal(
      unwrapFenceContinuations(chunks).replaceAll("\n", ""),
      text.replaceAll("\n", "")
    );
  });

  it("preserves a blank line inside a fence across a cut", () => {
    const text =
      "```js\n" +
      "const a = 1;\n".repeat(80) +
      "\n" +
      "const b = 2;\n".repeat(80) +
      "```";
    const chunks = splitForDiscord(text);
    assert.ok(chunks.length >= 2);
    assertWithinLimit(chunks);
    assert.equal(unwrapFenceContinuations(chunks), text);
  });

  it("does not drop text when a fence prefix leaves little room for the closer", () => {
    const lang = "L".repeat(1990);
    const payload = "PAYLOAD_UNIQUE_xyz";
    const text = "```" + lang + "\n" + payload.repeat(30) + "\n```";
    const chunks = splitForDiscord(text);
    assertWithinLimit(chunks);
    const recovered = chunks
      .map((chunk) =>
        chunk.replace(/^```[\s\S]*?\n/, "").replace(/\n?```$/, "")
      )
      .join("");
    assert.equal(recovered.replaceAll("\n", ""), payload.repeat(30));
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
    assert.equal(chunks.join("").replaceAll(" ", ""), replaced.replaceAll(" ", ""));
  });
});
