import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Collection, PermissionsBitField } from "discord.js";
import Status, { canViewHealth } from "../slashcommands/util/status.js";
import { createImageGenProbe, rememberSlashRegistration } from "../modules/guildHealth.js";
import { createUsagePulse, FEATURE_EVENTS } from "../modules/usagePulse.js";

const SECRET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vThisIsASecretToken/pub?output=csv";

function mockInteraction({
  guildId = "guild-1",
  guildName = "Alpha Pub",
  userId = "admin-1",
  isAdmin = true,
  all = null,
} = {}) {
  const replies = [];
  return {
    guild: guildId ? { id: guildId, name: guildName } : null,
    user: { id: userId },
    memberPermissions: {
      has(flag) {
        return isAdmin && flag === PermissionsBitField.Flags.Administrator;
      },
    },
    options: {
      getBoolean(name) {
        return name === "all" ? all : null;
      },
    },
    replies,
    deferred: false,
    replied: false,
    async reply(payload) {
      this.replied = true;
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

function mockClient({
  packs = [],
  ownerId = "owner-1",
  guilds = [{ id: "guild-1", name: "Alpha Pub" }],
} = {}) {
  const store = {};
  for (const guild of guilds) {
    store[guild.id] = guild.id === "guild-1" ? { context_packs: packs } : {};
  }
  const slashcommands = new Collection();
  slashcommands.set("status", { help: { name: "status" } });
  slashcommands.set("help", { help: { name: "help" } });
  const pulse = createUsagePulse({ now: () => Date.parse("2026-09-23T03:00:00.000Z"), flushMs: 0 });
  pulse.recordEvent("guild-1", FEATURE_EVENTS.IMAGE_GEN_SUCCESS);
  const client = {
    config: { botOwnerId: ownerId, geminiKey: "k", clientId: "c" },
    usagePulse: pulse,
    imageGenProbe: createImageGenProbe(),
    slashcommands,
    readyAt: new Date(),
    uptime: 60_000,
    isReady: () => true,
    ws: { ping: 20, shards: { size: 1 } },
    logger: { log() {} },
    settings: {
      get(id) {
        return store[id];
      },
    },
    getSettings(guild) {
      return store[guild.id] || {};
    },
    geminiAI: {
      contextPacks: {
        getUrlStatus() {
          return { ttlMs: 10 * 60 * 1000 };
        },
      },
    },
    guilds: {
      cache: new Map(guilds.map((g) => [g.id, g])),
      async fetch() {},
    },
  };
  rememberSlashRegistration(client, {
    ok: true,
    loaded: 2,
    registered: 2,
    at: 1_700_000_000_000,
    scope: "global",
  });
  return client;
}

function embedText(payload) {
  const embed = payload.embeds?.[0];
  return embed?.data?.description || embed?.description || payload.content || "";
}

describe("/status command", () => {
  it("is an admin slash command with an owner-only all option", () => {
    const cmd = new Status(mockClient());
    assert.equal(cmd.help.name, "status");
    assert.equal(cmd.help.category, "admin");
    const json = cmd.data.toJSON();
    assert.ok(json.default_member_permissions);
    assert.equal(json.dm_permission, false);
    assert.ok((json.options || []).some((o) => o.name === "all"));
  });

  it("rejects non-admins and DMs with an ephemeral reply", async () => {
    const cmd = new Status(mockClient());
    const user = mockInteraction({ isAdmin: false, userId: "rando" });
    await cmd.execute(user);
    assert.equal(user.replies[0].ephemeral, true);
    assert.match(user.replies[0].content, /only for server administrators/);

    const dm = mockInteraction({ guildId: null, userId: "owner-1" });
    await cmd.execute(dm);
    assert.equal(dm.replies[0].ephemeral, true);
    assert.match(dm.replies[0].content, /server/);
  });

  it("replies with an ephemeral green/yellow/red embed and no secrets", async () => {
    const client = mockClient({
      packs: [
        {
          name: "plays",
          kind: "plays",
          url: SECRET_URL,
          last_result: "ok",
          last_ok_at: 1_700_000_000_000,
          last_attempt_at: 1_700_000_000_000,
          last_row_count: 8,
        },
      ],
    });
    const cmd = new Status(client);
    const interaction = mockInteraction({ isAdmin: true });
    await cmd.execute(interaction);
    assert.equal(interaction.replies[0].ephemeral, true);
    assert.ok(interaction.replies[0].embeds?.[0]);
    const text = embedText(interaction.replies[0]);
    assert.match(text, /Alpha Pub/);
    assert.match(text, /Overall:/);
    assert.match(text, /Context pack/);
    assert.match(text, /Image generation/);
    assert.match(text, /Slash commands/);
    assert.match(text, /`plays`/);
    assert.doesNotMatch(text, /2PACX/);
    assert.doesNotMatch(text, /ThisIsASecretToken/);
  });

  it("limits all-server rollup to the bot owner", async () => {
    const client = mockClient({
      guilds: [
        { id: "guild-1", name: "Alpha Pub" },
        { id: "guild-2", name: "Beta Den" },
      ],
    });
    const cmd = new Status(client);

    const admin = mockInteraction({ userId: "mod-1", isAdmin: true, all: true });
    await cmd.execute(admin);
    assert.match(admin.replies[0].content, /bot owner/i);
    assert.equal(admin.replies[0].ephemeral, true);

    const owner = mockInteraction({ userId: "owner-1", isAdmin: false, all: true });
    await cmd.execute(owner);
    const text = owner.replies.find((payload) => payload.content && !payload.deferred)?.content || "";
    assert.match(text, /all servers/i);
    assert.match(text, /Alpha Pub/);
    assert.match(text, /Beta Den/);
    assert.doesNotMatch(text, /2PACX/);
  });

  it("treats bot owner and guild admins as viewers", () => {
    const client = mockClient();
    assert.equal(
      canViewHealth(client, mockInteraction({ userId: "owner-1", isAdmin: false })),
      true
    );
    assert.equal(
      canViewHealth(client, mockInteraction({ userId: "mod-1", isAdmin: true })),
      true
    );
    assert.equal(
      canViewHealth(client, mockInteraction({ userId: "user-1", isAdmin: false })),
      false
    );
  });
});
