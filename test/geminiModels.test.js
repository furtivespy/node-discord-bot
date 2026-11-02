import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGeminiAI } from "../modules/geminiai.js";

const CHAT_MODEL = "gemini-3.8-flash";
const IMAGE_MODEL = "gemini-nano-banana-2.1";

function makeAi() {
  return createGeminiAI({
    config: { geminiKey: "test-key" },
    logger: { log() {}, warn() {}, error() {} },
    user: { id: "bot-id" },
  });
}

function recordModels(ai, respond) {
  const models = [];
  ai.AI2 = {
    models: {
      async generateContent(req) {
        models.push(req.model);
        return respond(req);
      },
    },
  };
  return models;
}

describe("pinned Gemini model IDs (FUR-163)", () => {
  it("uses gemini-3.8-flash for chat, grounding, prompt, and code-explain", async () => {
    const ai = makeAi();
    const models = recordModels(ai, () => ({
      candidates: [{ content: { parts: [{ text: '{"grounding":"none"}' }] } }],
    }));
    const contents = [{ role: "user", parts: [{ text: "hello" }] }];
    const snapshot = { botname: "Bender", clientId: "bot-1", settings: {} };

    await ai.chooseGrounding(contents);
    await ai.generateContentWithTools(contents, snapshot, []);
    await ai.explainCode("print(1)", "python");
    await ai.runPrompt("say hi");

    assert.deepEqual(models, [CHAT_MODEL, CHAT_MODEL, CHAT_MODEL, CHAT_MODEL]);
  });

  it("uses gemini-nano-banana-2.1 for image generation", async () => {
    const ai = makeAi();
    const models = recordModels(ai, () => ({
      candidates: [{
        content: { parts: [{ inlineData: { data: "QQ==", mimeType: "image/png" } }] },
      }],
    }));
    ai.createAttachmentFromInlineData = () => ({ name: "ok.png" });
    const image = await ai.generateImageNew("a robot", { guildId: "guild-1" });
    assert.ok(image);
    assert.deepEqual(models, [IMAGE_MODEL]);
  });
});
