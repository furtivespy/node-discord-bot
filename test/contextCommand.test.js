const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Context = require("../slashcommands/util/context.js");

const SECRET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vThisIsASecretToken/pub?output=csv";

function mockInteraction({ subcommand, strings = {} } = {}) {
  const replies = [];
  return {
    guild: { id: "guild-1" },
    options: {
      getSubcommand: () => subcommand,
      getString(name, required) {
        if (required && strings[name] == null) throw new Error(`missing ${name}`);
        return strings[name] ?? null;
      },
    },
    replies,
    async reply(payload) {
      replies.push(payload);
      return payload;
    },
  };
}

function mockClient({ fetchResult } = {}) {
  const store = {};
  const logs = [];
  return {
    logs,
    settings: {
      has(id) {
        return Boolean(store[id]);
      },
      get(id) {
        return store[id];
      },
      set(id, value, key) {
        if (!store[id]) store[id] = {};
        if (key) store[id][key] = value;
        else store[id] = value;
      },
    },
    getSettings(guild) {
      return store[guild.id] || {};
    },
    logger: {
      log(content) {
        logs.push(String(content));
      },
    },
    geminiAI: {
      contextPacks: {
        invalidate() {},
        async fetchUrl() {
          return fetchResult || { ok: true, bytes: 42 };
        },
      },
    },
  };
}

describe("/context command", () => {
  it("stores a pack and never echoes the full URL", async () => {
    const client = mockClient();
    const cmd = new Context(client);
    const add = mockInteraction({
      subcommand: "add",
      strings: { url: SECRET_URL, name: "plays", kind: "plays" },
    });
    await cmd.execute(add);

    assert.equal(add.replies.length, 1);
    assert.equal(add.replies[0].ephemeral, true);
    assert.match(add.replies[0].content, /Added context pack `plays`/);
    assert.match(add.replies[0].content, /https:\/\/docs\.google\.com\/…/);
    assert.doesNotMatch(add.replies[0].content, /2PACX/);
    assert.deepEqual(client.getSettings({ id: "guild-1" }).context_packs, [
      { name: "plays", kind: "plays", url: SECRET_URL },
    ]);

    const list = mockInteraction({ subcommand: "list" });
    await cmd.execute(list);
    assert.equal(list.replies[0].ephemeral, true);
    assert.match(list.replies[0].content, /`plays` \(plays\)/);
    assert.doesNotMatch(list.replies[0].content, /2PACX/);
  });

  it("rejects a non-https URL without saving", async () => {
    const client = mockClient();
    const cmd = new Context(client);
    const interaction = mockInteraction({
      subcommand: "add",
      strings: { url: "http://example.com/plays.csv" },
    });
    await cmd.execute(interaction);
    assert.match(interaction.replies[0].content, /https/);
    assert.equal(client.getSettings({ id: "guild-1" }).context_packs, undefined);
  });
});
