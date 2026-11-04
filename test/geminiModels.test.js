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

function recordRequests(ai, respond) {
  const requests = [];
  ai.AI2 = {
    models: {
      async generateContent(req) {
        requests.push(req);
        return respond(req);
      },
    },
  };
  return requests;
}

describe("pinned Gemini model IDs (FUR-163)", () => {
  it("uses gemini-3.8-flash for chat, grounding, prompt, and code-explain", async () => {
    const ai = makeAi();
    const requests = recordRequests(ai, () => ({
      candidates: [{ content: { parts: [{ text: '{"grounding":"none"}' }] } }],
    }));
    const contents = [{ role: "user", parts: [{ text: "hello" }] }];
    const snapshot = { botname: "Bender", clientId: "bot-1", settings: {} };

    await ai.chooseGrounding(contents);
    await ai.generateContentWithTools(contents, snapshot, []);
    await ai.explainCode("print(1)", "python");
    await ai.runPrompt("say hi");

    assert.deepEqual(requests.map((req) => req.model), [CHAT_MODEL, CHAT_MODEL, CHAT_MODEL, CHAT_MODEL]);
  });

  it("uses thinkingLevel low and omits temperature in chooseGrounding", async () => {
    const ai = makeAi();
    const requests = recordRequests(ai, () => ({
      candidates: [{ content: { parts: [{ text: '{"grounding":"none"}' }] } }],
    }));

    await ai.chooseGrounding([{ role: "user", parts: [{ text: "hello" }] }]);

    const req = requests[0];
    assert.equal(req.model, CHAT_MODEL);
    assert.deepEqual(req.config.thinkingConfig, { thinkingLevel: "low" });
    assert.equal("temperature" in req.config, false);
    assert.equal("thinkingBudget" in (req.config.thinkingConfig || {}), false);
  });

  it("sends generateContent imageConfig for nano-banana-2.1, not responseFormat", async () => {
    const ai = makeAi();
    const requests = recordRequests(ai, () => ({
      candidates: [{
        content: { parts: [{ inlineData: { data: "QQ==", mimeType: "image/png" } }] },
      }],
    }));
    ai.createAttachmentFromInlineData = () => ({ name: "ok.png" });

    const defaultImage = await ai.generateImageNew("a robot", { guildId: "guild-1" });
    const wideImage = await ai.generateImageNew("a city", { guildId: "guild-1", aspectRatio: "16:9" });

    assert.ok(defaultImage);
    assert.ok(wideImage);
    assert.equal(requests[0].model, IMAGE_MODEL);
    assert.deepEqual(requests[0].config.responseModalities, ["IMAGE"]);
    assert.deepEqual(requests[0].config.imageConfig, { aspectRatio: "1:1" });
    assert.equal("responseFormat" in requests[0].config, false);
    assert.deepEqual(requests[1].config.imageConfig, { aspectRatio: "16:9" });
  });

  it("ignores thought parts when the grounding router reads JSON", async () => {
    const ai = makeAi();
    recordRequests(ai, () => ({
      text: "I should pick search. {\"grounding\":\"google_search\"}",
      candidates: [{
        content: {
          parts: [
            { thought: true, text: "I should pick search because this is current events." },
            { text: '{"grounding":"file_search"}' },
          ],
        },
      }],
    }));

    const choice = await ai.chooseGrounding([{ role: "user", parts: [{ text: "who won?" }] }]);
    assert.equal(choice, "file_search");
  });
});

describe("router thought filtering (FUR-163)", () => {
  it("drops thought text from routerResponseText even when result.text includes it", () => {
    const ai = makeAi();
    const text = ai.routerResponseText({
      text: "thinking out loud {\"grounding\":\"google_search\"}",
      candidates: [{
        content: {
          parts: [
            { thought: true, text: "thinking out loud" },
            { text: '{"grounding":"none"}' },
          ],
        },
      }],
    });
    assert.equal(text, '{"grounding":"none"}');
  });

  it("returns empty text when every part is a thought", () => {
    const ai = makeAi();
    const text = ai.routerResponseText({
      text: "secret chain of thought",
      candidates: [{
        content: { parts: [{ thought: true, text: "secret chain of thought" }] },
      }],
    });
    assert.equal(text, "");
  });
});
