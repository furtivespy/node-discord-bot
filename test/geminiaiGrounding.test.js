const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGeminiAI } = require("../modules/geminiai.js");

describe("GeminiAI grounding XOR + context packs", () => {
  function makeAi() {
    return createGeminiAI({
      config: { geminiKey: "test-key" },
      logger: { log() {}, warn() {}, error() {} },
      getDatabase() {
        return {
          hasFileSearchReady: () => true,
          getFileSearchStore: () => "fileSearchStores/test",
        };
      },
    });
  }

  it("still picks exactly one grounding tool", () => {
    const ai = makeAi();
    const message = { guild: { id: "1" } };
    const google = ai.chatTools(message, "google_search");
    const files = ai.chatTools(message, "file_search");
    const none = ai.chatTools(message, "none");

    assert.equal(google.length, 1);
    assert.ok(google[0].googleSearch);
    assert.equal(Boolean(google[0].fileSearch), false);

    assert.equal(files.length, 1);
    assert.ok(files[0].fileSearch);
    assert.equal(Boolean(files[0].googleSearch), false);

    assert.deepEqual(none, []);
  });

  it("attaches guild CSV after routing without changing tools", async () => {
    const ai = makeAi();
    const secret =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vSecret/pub?output=csv";
    ai.contextPacks = require("../modules/contextPacks.js").createContextPackService({
      fetch: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        async text() {
          return "Date,Game,Winner\n2026-01-04,Azul,Shane";
        },
      }),
      lookup: async () => ["93.184.216.34"],
      logger: { log() {} },
    });

    const contents = [{ role: "user", parts: [{ text: "Who won Azul?" }] }];
    const message = {
      content: "Who won Azul?",
      settings: { context_packs: [{ name: "plays", kind: "plays", url: secret }] },
    };
    const packed = await ai.attachGuildContextPacks(contents, message);
    const tools = ai.chatTools({ guild: { id: "1" } }, "google_search");

    assert.match(packed.contents[0].parts[0].text, /Azul,Shane/);
    assert.match(packed.note, /not a grounding tool/);
    assert.equal(tools.length, 1);
    assert.ok(tools[0].googleSearch);
    assert.equal(contents[0].parts[0].text, "Who won Azul?");
  });
});
