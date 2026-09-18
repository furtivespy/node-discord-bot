import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PermissionsBitField } from "discord.js";
import Context from "../slashcommands/util/context.js";
import { createContextPackService, persistGuildPackStatus } from "../modules/contextPacks.js";

const SECRET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vThisIsASecretToken/pub?output=csv";

const PLAYS_CSV = ["Date,Game,Winner", "2026-01-04,Azul,Shane", "2026-01-11,Catan,Will"].join("\n");

function mockInteraction({ subcommand, strings = {}, booleans = {}, isAdmin = true, userId = "admin-1" } = {}) {
  const replies = [];
  return {
    guild: { id: "guild-1", name: "Alpha Pub" },
    user: { id: userId },
    memberPermissions: {
      has() {
        return isAdmin;
      },
    },
    options: {
      getSubcommand: () => subcommand,
      getString(name, required) {
        if (required && strings[name] == null) throw new Error(`missing ${name}`);
        return strings[name] ?? null;
      },
      getBoolean(name) {
        return booleans[name] ?? null;
      },
    },
    replies,
    async reply(payload) {
      replies.push(payload);
      return payload;
    },
    async deferReply(payload) {
      this.deferred = true;
      replies.push({ deferred: true, ...payload });
    },
    async editReply(payload) {
      replies.push(payload);
      return payload;
    },
    async followUp(payload) {
      replies.push(payload);
      return payload;
    },
  };
}

function mockResponse(text = PLAYS_CSV, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => null },
    async text() {
      return text;
    },
  };
}

function mockClient({ fetchResult, service } = {}) {
  const store = {};
  const logs = [];
  const client = {
    logs,
    config: { botOwnerId: "owner-1" },
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
    guilds: {
      cache: new Map([["guild-1", { id: "guild-1", name: "Alpha Pub" }]]),
      async fetch() {},
    },
    geminiAI: {
      contextPacks: service || {
        invalidate() {},
        getUrlStatus() {
          return { ttlMs: 10 * 60 * 1000 };
        },
        async fetchUrl() {
          return fetchResult || { ok: true, bytes: 42, last_result: "ok", last_row_count: 2 };
        },
      },
    },
  };
  return client;
}

function clientWithLiveService({ fetch, now, logs } = {}) {
  const store = {};
  const logger = {
    log(content) {
      if (logs) logs.push(String(content));
    },
  };
  const client = {
    config: { botOwnerId: "owner-1" },
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
    logger,
    guilds: {
      cache: new Map([["guild-1", { id: "guild-1", name: "Alpha Pub" }]]),
      async fetch() {},
    },
  };
  client.geminiAI = {
    contextPacks: createContextPackService({
      lookup: async () => ["93.184.216.34"],
      fetch: fetch || (async () => mockResponse()),
      now: now || (() => 1_700_000_000_000),
      ttlMs: 10 * 60 * 1000,
      logger,
      persistPackStatus: (guildId, packName, status) => {
        persistGuildPackStatus(client, guildId, packName, status);
      },
    }),
  };
  return client;
}

function replyContent(interaction) {
  return interaction.replies.find((payload) => payload.content) || interaction.replies[0] || {};
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

    assert.equal(add.deferred, true);
    assert.equal(add.replies[0].ephemeral, true);
    const added = replyContent(add);
    assert.match(added.content, /Added context pack `plays`/);
    assert.match(added.content, /https:\/\/docs\.google\.com\/…/);
    assert.doesNotMatch(added.content, /2PACX/);
    const stored = client.getSettings({ id: "guild-1" }).context_packs;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].name, "plays");
    assert.equal(stored[0].kind, "plays");
    assert.equal(stored[0].url, SECRET_URL);
    assert.equal(stored[0].last_result, "ok");
    assert.equal(stored[0].last_row_count, 2);
    assert.doesNotMatch(JSON.stringify(add.replies), /2PACX/);

    const list = mockInteraction({ subcommand: "list" });
    await cmd.execute(list);
    assert.equal(list.replies[0].ephemeral, true);
    assert.match(list.replies[0].content, /`plays` \(plays\)/);
    assert.match(list.replies[0].content, /\/context status/);
    assert.match(list.replies[0].content, /\/context preview/);
    assert.match(list.replies[0].content, /healthy|never fetched|rows/);
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

  it("hides the freshness dashboard from non-admins", async () => {
    const client = mockClient();
    const cmd = new Context(client);
    const denied = mockInteraction({ subcommand: "status", isAdmin: false, userId: "rando" });
    await cmd.execute(denied);
    assert.equal(denied.replies[0].ephemeral, true);
    assert.match(denied.replies[0].content, /only for server administrators/);
  });

  it("shows a missing-pack dashboard that is distinct from a failing pack", async () => {
    const client = mockClient();
    const cmd = new Context(client);
    const status = mockInteraction({ subcommand: "status" });
    await cmd.execute(status);
    const text = status.replies[0].embeds[0].data.description;
    assert.equal(status.replies[0].ephemeral, true);
    assert.match(text, /No context packs configured/);
    assert.doesNotMatch(text, /broken/);
    assert.equal(status.replies[0].components.length, 0);
  });

  it("shows last fetch, rows, errors, and the full pack URL to admins", async () => {
    const client = clientWithLiveService({
      fetch: async () => mockResponse(),
    });
    const cmd = new Context(client);
    await cmd.execute(
      mockInteraction({
        subcommand: "add",
        strings: { url: SECRET_URL, name: "plays", kind: "plays" },
      })
    );

    const status = mockInteraction({ subcommand: "status" });
    await cmd.execute(status);
    const payload = status.replies[0];
    const text = payload.embeds[0].data.description;
    assert.equal(payload.ephemeral, true);
    assert.match(text, /`plays`/);
    assert.match(text, /healthy/);
    assert.doesNotMatch(text, /stale/);
    assert.match(text, /Configured: yes/);
    assert.match(text, /Last success:/);
    assert.match(text, /Last fetch: ok/);
    assert.match(text, /Cached rows: 2/);
    assert.match(text, /Cache TTL: 10 min/);
    assert.match(text, /2PACX-1vThisIsASecretToken/);
    assert.ok(payload.components.length >= 1);
    assert.ok(
      payload.components[0].components.some((button) => button.data.custom_id === "context:refresh:all")
    );
  });

  it("refresh now re-fetches and reports HTTP errors without printing secrets", async () => {
    let calls = 0;
    const client = clientWithLiveService({
      fetch: async () => {
        calls += 1;
        if (calls === 1) return mockResponse();
        return mockResponse("nope", { ok: false, status: 404 });
      },
    });
    const cmd = new Context(client);
    await cmd.execute(
      mockInteraction({
        subcommand: "add",
        strings: { url: SECRET_URL, name: "plays" },
      })
    );
    const refresh = mockInteraction({ subcommand: "refresh", strings: { name: "plays" } });
    await cmd.execute(refresh);
    assert.equal(calls, 2);
    assert.equal(refresh.deferred, true);
    assert.equal(refresh.replies[0].deferred, true);
    assert.equal(refresh.replies[0].ephemeral, true);
    const result = refresh.replies.find((payload) => payload.content);
    assert.equal(result.ephemeral, undefined);
    assert.match(result.content, /HTTP error \(404\)/);
    assert.match(result.content, /Last good copy is still in cache/);
    assert.doesNotMatch(result.content, /2PACX/);

    const stored = client.getSettings({ id: "guild-1" }).context_packs[0];
    assert.equal(stored.last_result, "http_error");
    assert.equal(stored.last_row_count, 2);
    assert.ok(stored.last_ok_at);

    const status = mockInteraction({ subcommand: "status" });
    await cmd.execute(status);
    const text = status.replies[0].embeds[0].data.description;
    assert.match(text, /stale/);
    assert.match(text, /HTTP error \(404\)/);
    assert.match(text, /Configured: yes/);
    assert.doesNotMatch(text, /No context packs configured/);
    assert.match(text, /2PACX-1vThisIsASecretToken/);
  });

  it("defers /context refresh before awaiting the pack fetch", async () => {
    const refresh = mockInteraction({ subcommand: "refresh" });
    let deferredWhenFetchStarted = false;
    const client = mockClient({
      service: {
        invalidate() {},
        getUrlStatus() {
          return { ttlMs: 10 * 60 * 1000 };
        },
        async fetchUrl() {
          deferredWhenFetchStarted = Boolean(refresh.deferred);
          return { ok: true, bytes: 42, last_result: "ok", last_row_count: 2 };
        },
      },
    });
    client.settings.set(
      "guild-1",
      [{ name: "plays", kind: "plays", url: SECRET_URL }],
      "context_packs"
    );
    const cmd = new Context(client);
    await cmd.execute(refresh);
    assert.equal(deferredWhenFetchStarted, true);
    assert.equal(refresh.replies[0].deferred, true);
    assert.equal(refresh.replies[0].ephemeral, true);
    assert.match(refresh.replies[1].content, /Refreshed 1 pack/);
  });

  it("defers /context attach before awaiting the pack fetch", async () => {
    const attach = mockInteraction({
      subcommand: "attach",
      strings: { url: SECRET_URL, name: "plays" },
    });
    let deferredWhenFetchStarted = false;
    const client = mockClient({
      service: {
        invalidate() {},
        getUrlStatus() {
          return { ttlMs: 10 * 60 * 1000 };
        },
        async fetchUrl() {
          deferredWhenFetchStarted = Boolean(attach.deferred);
          return { ok: true, bytes: 42, last_result: "ok", last_row_count: 2 };
        },
      },
    });
    const cmd = new Context(client);
    await cmd.execute(attach);
    assert.equal(deferredWhenFetchStarted, true);
    assert.equal(attach.replies[0].deferred, true);
    assert.equal(attach.replies[0].ephemeral, true);
    assert.match(replyContent(attach).content, /Attached context pack `plays`/);
  });

  it("shows persisted last_result ok as healthy when the in-memory cache is empty", async () => {
    const client = mockClient({
      service: {
        invalidate() {},
        getUrlStatus() {
          return { ttlMs: 10 * 60 * 1000, inCache: false, cacheStale: true };
        },
        async fetchUrl() {
          return { ok: true, bytes: 42, last_result: "ok", last_row_count: 12 };
        },
      },
    });
    client.settings.set(
      "guild-1",
      [
        {
          name: "plays",
          kind: "plays",
          url: SECRET_URL,
          last_result: "ok",
          last_ok_at: 1_700_000_000_000,
          last_attempt_at: 1_700_000_000_000,
          last_row_count: 12,
        },
      ],
      "context_packs"
    );
    const cmd = new Context(client);
    const status = mockInteraction({ subcommand: "status" });
    await cmd.execute(status);
    const text = status.replies[0].embeds[0].data.description;
    assert.match(text, /healthy/);
    assert.match(text, /Last fetch: ok/);
    assert.doesNotMatch(text, /latest fetch failed/);
    assert.doesNotMatch(text, /stale/);
  });

  it("rejects reserved pack name all and still renders status if one already exists", async () => {
    const client = mockClient();
    const cmd = new Context(client);
    const add = mockInteraction({
      subcommand: "add",
      strings: { url: SECRET_URL, name: "all" },
    });
    await cmd.execute(add);
    assert.match(add.replies[0].content, /reserved/);
    assert.equal(client.getSettings({ id: "guild-1" }).context_packs, undefined);

    const refreshNamed = mockInteraction({
      subcommand: "refresh",
      strings: { name: "all" },
    });
    client.settings.set(
      "guild-1",
      [{ name: "plays", kind: "plays", url: SECRET_URL }],
      "context_packs"
    );
    await cmd.execute(refreshNamed);
    assert.match(refreshNamed.replies[0].content, /reserved/);
    assert.equal(refreshNamed.deferred, undefined);

    client.settings.set(
      "guild-1",
      [
        { name: "all", kind: "plays", url: SECRET_URL, last_result: "ok" },
        { name: "plays", kind: "plays", url: SECRET_URL, last_result: "ok" },
      ],
      "context_packs"
    );
    const status = mockInteraction({ subcommand: "status" });
    await cmd.execute(status);
    const ids = status.replies[0].components
      .flatMap((row) => row.components)
      .map((button) => button.data.custom_id);
    assert.deepEqual(ids, ["context:refresh:all", "context:refresh:plays"]);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("owner all-guilds view is denied to ordinary guild admins", async () => {
    const client = mockClient();
    const cmd = new Context(client);
    const denied = mockInteraction({
      subcommand: "status",
      booleans: { all: true },
      isAdmin: true,
      userId: "guild-admin",
    });
    await cmd.execute(denied);
    assert.match(denied.replies[0].content, /only for the bot owner/);
    assert.equal(denied.replies[0].ephemeral, true);
  });

  it("owner all-guilds view includes the same pack details as /context status", async () => {
    const client = clientWithLiveService();
    const cmd = new Context(client);
    await cmd.execute(
      mockInteraction({
        subcommand: "add",
        strings: { url: SECRET_URL, name: "plays", kind: "plays" },
      })
    );

    const status = mockInteraction({ subcommand: "status" });
    await cmd.execute(status);
    const singleText = status.replies[0].embeds[0].data.description;

    const all = mockInteraction({
      subcommand: "status",
      booleans: { all: true },
      userId: "owner-1",
    });
    await cmd.execute(all);
    const allText = all.replies.map((payload) => payload.content).filter(Boolean).join("\n");

    for (const field of [
      /Configured: yes/,
      /Health: ✅ healthy/,
      /Last success:/,
      /Last fetch: ok/,
      /Cached rows: 2/,
      /Cache TTL: 10 min/,
      /2PACX-1vThisIsASecretToken/,
    ]) {
      assert.match(singleText, field);
      assert.match(allText, field);
    }
    assert.match(allText, /Alpha Pub/);
  });

  it("is Discord-admin-only and registers attach/preview/detach aliases", () => {
    const cmd = new Context(mockClient());
    const json = cmd.data.toJSON();
    assert.equal(json.default_member_permissions, String(PermissionsBitField.Flags.Administrator));
    const names = (json.options || []).map((option) => option.name);
    for (const name of [
      "attach",
      "set",
      "add",
      "list",
      "preview",
      "detach",
      "clear",
      "remove",
      "refresh",
      "status",
    ]) {
      assert.ok(names.includes(name), name);
    }
  });

  it("denies non-admins from attach/list/preview, not only status", async () => {
    const client = mockClient();
    const cmd = new Context(client);
    for (const subcommand of ["attach", "list", "preview", "refresh"]) {
      const denied = mockInteraction({
        subcommand,
        strings: { url: SECRET_URL, name: "plays" },
        isAdmin: false,
        userId: "rando",
      });
      await cmd.execute(denied);
      assert.equal(denied.replies[0].ephemeral, true);
      assert.match(denied.replies[0].content, /only for server administrators/);
      assert.doesNotMatch(JSON.stringify(denied.replies), /2PACX/);
    }
    assert.equal(client.getSettings({ id: "guild-1" }).context_packs, undefined);
  });

  it("attach and set store the URL without echoing it; detach removes it", async () => {
    const client = mockClient();
    const cmd = new Context(client);
    const attach = mockInteraction({
      subcommand: "attach",
      strings: { url: SECRET_URL, name: "plays", kind: "plays" },
    });
    await cmd.execute(attach);
    const attached = replyContent(attach);
    assert.match(attached.content, /Attached context pack `plays`/);
    assert.match(attached.content, /https:\/\/docs\.google\.com\/…/);
    assert.doesNotMatch(attached.content, /2PACX/);
    assert.equal(client.getSettings({ id: "guild-1" }).context_packs[0].url, SECRET_URL);

    const set = mockInteraction({
      subcommand: "set",
      strings: { url: SECRET_URL, name: "plays", kind: "plays" },
    });
    await cmd.execute(set);
    assert.match(replyContent(set).content, /Updated context pack `plays`/);
    assert.doesNotMatch(replyContent(set).content, /2PACX/);

    const detach = mockInteraction({ subcommand: "detach", strings: { name: "plays" } });
    await cmd.execute(detach);
    assert.match(detach.replies[0].content, /Detached context pack `plays`/);
    assert.deepEqual(client.getSettings({ id: "guild-1" }).context_packs, []);
  });

  it("preview shows a redacted sample from cache and never prints the pack URL", async () => {
    const secretCsv = [
      "Date,api_key,email,notes",
      `2026-01-04,sk-abcdefghijklmnopqrstuvwxyz,will@example.com,see ${SECRET_URL}`,
    ].join("\n");
    let calls = 0;
    const logs = [];
    const client = clientWithLiveService({
      logs,
      fetch: async () => {
        calls += 1;
        return mockResponse(secretCsv);
      },
    });
    const cmd = new Context(client);
    await cmd.execute(
      mockInteraction({
        subcommand: "attach",
        strings: { url: SECRET_URL, name: "plays" },
      })
    );
    assert.equal(calls, 1);

    const preview = mockInteraction({ subcommand: "preview" });
    await cmd.execute(preview);
    assert.equal(preview.deferred, true);
    assert.equal(preview.replies[0].ephemeral, true);
    const result = preview.replies.find((payload) => payload.content);
    assert.match(result.content, /Preview of `plays`/);
    assert.match(result.content, /cache/);
    assert.match(result.content, /Date,api_key,email,notes/);
    assert.match(result.content, /\[redacted\]/);
    assert.doesNotMatch(result.content, /2PACX/);
    assert.doesNotMatch(result.content, /sk-abcdefghijklmnopqrstuvwxyz/);
    assert.doesNotMatch(result.content, /will@example\.com/);
    assert.equal(calls, 1);
    assert.ok(logs.every((line) => !line.includes("2PACX")));
  });

  it("preview reports HTTP errors without printing secrets", async () => {
    const logs = [];
    const client = clientWithLiveService({
      logs,
      fetch: async () => mockResponse("nope", { ok: false, status: 503 }),
    });
    const cmd = new Context(client);
    await cmd.execute(
      mockInteraction({
        subcommand: "attach",
        strings: { url: SECRET_URL, name: "plays" },
      })
    );
    const preview = mockInteraction({ subcommand: "preview", strings: { name: "plays" } });
    await cmd.execute(preview);
    const result = preview.replies.find((payload) => payload.content);
    assert.match(result.content, /Could not preview `plays`/);
    assert.match(result.content, /HTTP error \(503\)/);
    assert.doesNotMatch(result.content, /2PACX/);
    assert.ok(logs.some((line) => line.includes("docs.google.com/…")));
    assert.ok(logs.every((line) => !line.includes("2PACX")));
  });
});
