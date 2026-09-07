const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { extractImageCallout } = require("../modules/imageCallout");
const { createGeminiAI } = require("../modules/geminiai");

function stubGemini() {
  const ai = createGeminiAI({
    config: { geminiKey: "test" },
    user: { id: "123" },
    logger: { log() {}, warn() {}, error() {} },
  });
  ai.generateImageNew = async (prompt) => ({ prompt });
  return ai;
}

describe("extractImageCallout", () => {
  it("strips a Generating image of marker on its own line and keeps the reply", () => {
    const { text, imagePrompt } = extractImageCallout(
      "Bite my shiny metal ass.\n\nGenerating image of Bender on a unicycle"
    );
    assert.equal(text, "Bite my shiny metal ass.");
    assert.equal(imagePrompt, "Bender on a unicycle");
  });

  it("strips a Processing image of marker", () => {
    const { text, imagePrompt } = extractImageCallout(
      "Here you go.\nProcessing image of a sunset over Chicago"
    );
    assert.equal(text, "Here you go.");
    assert.equal(imagePrompt, "a sunset over Chicago");
  });

  it("strips inline narration like 'and then also generate an image of'", () => {
    const { text, imagePrompt } = extractImageCallout(
      "I'm saying these things and then also generate an image of blah blah."
    );
    assert.equal(text, "I'm saying these things");
    assert.equal(imagePrompt, "blah blah");
  });

  it("strips 'I'm generating an image of' narration", () => {
    const { text, imagePrompt } = extractImageCallout(
      "Sure meatbag, I'm generating an image of a giant sandwich."
    );
    assert.equal(text, "Sure meatbag");
    assert.equal(imagePrompt, "a giant sandwich");
  });

  it("returns empty text when the reply is only the callout", () => {
    const { text, imagePrompt } = extractImageCallout(
      "Generating image of a cat in a hat"
    );
    assert.equal(text, "");
    assert.equal(imagePrompt, "a cat in a hat");
  });

  it("leaves normal text-only replies unchanged", () => {
    const reply = "Just a normal reply, meatbag. No pictures today.";
    const { text, imagePrompt } = extractImageCallout(reply);
    assert.equal(text, reply);
    assert.equal(imagePrompt, null);
  });

  it("does not strip trailing commas or and/also from text-only replies", () => {
    const cases = [
      "Hello meatbag,",
      "I went to the store and then also",
      "Wait, also",
      "Sure meatbag: ",
    ];
    for (const reply of cases) {
      const { text, imagePrompt } = extractImageCallout(reply);
      assert.equal(text, reply, `rewrote text-only reply: ${JSON.stringify(reply)}`);
      assert.equal(imagePrompt, null);
    }
  });

  it("does not treat casual 'image of' talk as a callout", () => {
    const reply = "That's a nice image of a sunset you posted.";
    const { text, imagePrompt } = extractImageCallout(reply);
    assert.equal(text, reply);
    assert.equal(imagePrompt, null);
  });

  it("does not treat conversational 'create an image of' as a callout", () => {
    const reply = "You can create an image of a sunset if you want.";
    const { text, imagePrompt } = extractImageCallout(reply);
    assert.equal(text, reply);
    assert.equal(imagePrompt, null);
  });

  it("does not match 'create' inside 'recreate an image of'", () => {
    const reply = "recreate an image of the 90s";
    const { text, imagePrompt } = extractImageCallout(reply);
    assert.equal(text, reply);
    assert.equal(imagePrompt, null);
  });

  it("is case-insensitive for the instructed markers", () => {
    const { text, imagePrompt } = extractImageCallout(
      "Okay.\nGENERATING IMAGE OF a dragon"
    );
    assert.equal(text, "Okay.");
    assert.equal(imagePrompt, "a dragon");
  });

  it("matches 'Generating an image of' with the article", () => {
    const { text, imagePrompt } = extractImageCallout(
      "Sure. Generating an image of a pizza"
    );
    assert.equal(text, "Sure.");
    assert.equal(imagePrompt, "a pizza");
  });

  it("drops an empty ||SEPARATE|| chunk left behind by the callout", () => {
    const { text, imagePrompt } = extractImageCallout(
      "Hello meatbag.||SEPARATE||Generating image of a robot"
    );
    assert.equal(text, "Hello meatbag.");
    assert.equal(imagePrompt, "a robot");
  });

  it("keeps later conversational chunks after stripping a leading callout", () => {
    const { text, imagePrompt } = extractImageCallout(
      "Generating image of a robot||SEPARATE||Hope you like it"
    );
    assert.equal(text, "Hope you like it");
    assert.equal(imagePrompt, "a robot");
  });

  it("keeps prior sentences that contain 'and' when the callout is a new line", () => {
    const { text, imagePrompt } = extractImageCallout(
      "You and I should hang out.\nGenerating image of two robots"
    );
    assert.equal(text, "You and I should hang out.");
    assert.equal(imagePrompt, "two robots");
  });

  it("uses the first prompt when multiple markers are present", () => {
    const { text, imagePrompt } = extractImageCallout(
      "Generating image of a cat\nProcessing image of a dog"
    );
    assert.equal(text, "");
    assert.equal(imagePrompt, "a cat");
  });

  it("strips more than five markers instead of leaving leftovers in Discord text", () => {
    const reply = [
      "Generating image of a",
      "Generating image of b",
      "Generating image of c",
      "Generating image of d",
      "Generating image of e",
      "Generating image of f",
      "Generating image of g",
      "thanks",
    ].join("\n");
    const { text, imagePrompt } = extractImageCallout(reply);
    assert.equal(text, "thanks");
    assert.equal(imagePrompt, "a");
    assert.equal(/generating image of/i.test(text), false);
  });

  it("does not leave no-text-no-image when the marker has no prompt", () => {
    for (const reply of ["Generating image of", "Generating image of..."]) {
      const { text, imagePrompt } = extractImageCallout(reply);
      assert.equal(text, reply);
      assert.equal(imagePrompt, null);
    }
  });

  it("strips an empty marker when other text remains, without generating", () => {
    const { text, imagePrompt } = extractImageCallout(
      "Hello meatbag.\nGenerating image of"
    );
    assert.equal(text, "Hello meatbag.");
    assert.equal(imagePrompt, null);
  });
});

describe("processResponse image callouts", () => {
  it("returns conversational text without the image-gen marker and still generates", async () => {
    const ai = stubGemini();
    const { response, imageResponse } = await ai.processResponse({
      candidates: [{
        content: { parts: [{ text: "Hello.\nGenerating image of a robot" }] },
      }],
    }, "Bender");
    assert.equal(response, "Hello.");
    assert.deepEqual(imageResponse, { prompt: "generate an image of a robot" });
  });

  it("leaves text-only replies unchanged and does not generate an image", async () => {
    const ai = stubGemini();
    let generated = false;
    ai.generateImageNew = async () => {
      generated = true;
      return { prompt: "should not run" };
    };
    const { response, imageResponse } = await ai.processResponse({
      candidates: [{
        content: { parts: [{ text: "Just chatting, meatbag." }] },
      }],
    }, "Bender");
    assert.equal(response, "Just chatting, meatbag.");
    assert.equal(imageResponse, null);
    assert.equal(generated, false);
  });

  it("does not generate from conversational 'create an image of'", async () => {
    const ai = stubGemini();
    let generated = false;
    ai.generateImageNew = async () => {
      generated = true;
      return { prompt: "should not run" };
    };
    const reply = "You can create an image of a sunset if you want.";
    const { response, imageResponse } = await ai.processResponse({
      candidates: [{ content: { parts: [{ text: reply }] } }],
    }, "Bender");
    assert.equal(response, reply);
    assert.equal(imageResponse, null);
    assert.equal(generated, false);
  });

  it("does not rewrite trailing punctuation on a text-only reply", async () => {
    const ai = stubGemini();
    const reply = "Hello meatbag,";
    const { response, imageResponse } = await ai.processResponse({
      candidates: [{ content: { parts: [{ text: reply }] } }],
    }, "Bender");
    assert.equal(response, reply);
    assert.equal(imageResponse, null);
  });
});
