import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectHelpFeatures,
  collectCommandIds,
  rememberSlashCommandIds,
  ensureSlashCommandIds,
  formatCommandMention,
  imageGenAvailable,
} from "../modules/guildHelpFeatures.js";

const PACK = { name: "plays", kind: "plays", url: "https://example.com/plays.csv" };

function mockClient({
  settings = {},
  config = {},
  starboard = {},
  fileSearchReady = false,
  throwSettings = false,
  throwDb = false,
} = {}) {
  return {
    config,
    getSettings() {
      if (throwSettings) throw new Error("settings unavailable");
      return settings;
    },
    getGameData() {
      return starboard;
    },
    getDatabase() {
      if (throwDb) throw new Error("sqlite unavailable");
      return { hasFileSearchReady: () => fileSearchReady };
    },
  };
}

describe("guild help features", () => {
  it("marks context packs and image gen available when this guild has them", () => {
    const result = collectHelpFeatures(
      mockClient({
        settings: { context_packs: [PACK], image_gen: true },
        config: { geminiKey: "k" },
        fileSearchReady: true,
        starboard: { starboardChannel: "star-1" },
      }),
      { id: "guild-on" }
    );
    assert.equal(result.known, true);
    const byId = Object.fromEntries(result.items.map((item) => [item.id, item]));
    assert.equal(byId.context_packs.available, true);
    assert.equal(byId.image_gen.available, true);
    assert.equal(byId.file_search.available, true);
    assert.equal(byId.starboard.available, true);
    assert.equal(byId.starboard.adminOnly, true);
    assert.equal(byId.context_packs.command, "context");
  });

  it("marks packs and image gen as not set up when this guild lacks them", () => {
    const result = collectHelpFeatures(
      mockClient({
        settings: { image_gen: false },
        config: { geminiKey: "still-present" },
      }),
      { id: "guild-off" }
    );
    const byId = Object.fromEntries(result.items.map((item) => [item.id, item]));
    assert.equal(byId.context_packs.available, false);
    assert.equal(byId.image_gen.available, false);
    assert.equal(byId.file_search.available, false);
    assert.equal(byId.starboard.available, false);
  });

  it("treats legacy context URL keys as configured without needing context_packs", () => {
    const result = collectHelpFeatures(
      mockClient({
        settings: { publishedCsvUrl: "https://example.com/secret.csv" },
        config: { geminiKey: "k" },
      }),
      { id: "legacy" }
    );
    const packs = result.items.find((item) => item.id === "context_packs");
    assert.equal(packs.available, true);
  });

  it("falls back to geminiKey for image gen when no guild flag is set", () => {
    assert.equal(imageGenAvailable({}, { geminiKey: "k" }), true);
    assert.equal(imageGenAvailable({}, {}), false);
    assert.equal(imageGenAvailable({ image_gen: "off" }, { geminiKey: "k" }), false);
    assert.equal(imageGenAvailable({ enableImageGen: "yes" }, {}), true);
  });

  it("fails soft when there is no guild or settings throw", () => {
    assert.deepEqual(collectHelpFeatures(mockClient(), null), { known: false, items: [] });
    const broken = collectHelpFeatures(mockClient({ throwSettings: true }), { id: "g" });
    assert.equal(broken.known, false);
    assert.deepEqual(broken.items, []);
  });

  it("keeps other features when sqlite is unavailable", () => {
    const result = collectHelpFeatures(
      mockClient({
        settings: { context_packs: [PACK] },
        config: { geminiKey: "k" },
        throwDb: true,
      }),
      { id: "g" }
    );
    assert.equal(result.known, true);
    assert.equal(result.items.find((item) => item.id === "file_search").available, false);
    assert.equal(result.items.find((item) => item.id === "context_packs").available, true);
  });

  it("formats application command mentions and falls back to /name", () => {
    const client = {};
    rememberSlashCommandIds(client, [
      { name: "help", id: "111" },
      { name: "context", id: "222" },
    ]);
    const ids = collectCommandIds(client, {
      commands: { cache: { values: () => [{ name: "wiki", id: "333" }] } },
    });
    assert.equal(formatCommandMention("help", ids), "</help:111>");
    assert.equal(formatCommandMention("context", ids), "</context:222>");
    assert.equal(formatCommandMention("wiki", ids), "</wiki:333>");
    assert.equal(formatCommandMention("wiki", {}), "`/wiki`");
  });

  it("fetches command ids once when the cache is empty", async () => {
    let fetched = 0;
    const client = {
      application: {
        commands: {
          async fetch() {
            fetched += 1;
            return [{ name: "ping", id: "9" }];
          },
        },
      },
    };
    const first = await ensureSlashCommandIds(client, null);
    const second = await ensureSlashCommandIds(client, null);
    assert.equal(fetched, 1);
    assert.equal(first.ping, "9");
    assert.equal(second.ping, "9");
  });

  it("swallows command-id fetch errors so help can still render", async () => {
    const client = {
      application: {
        commands: {
          async fetch() {
            throw new Error("discord down");
          },
        },
      },
    };
    const ids = await ensureSlashCommandIds(client, null);
    assert.deepEqual(ids, {});
  });
});
