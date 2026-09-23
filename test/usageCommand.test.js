import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PermissionsBitField } from "discord.js";
import Usage, { canViewUsage } from "../slashcommands/util/usage.js";
import { createUsagePulse, FEATURE_EVENTS } from "../modules/usagePulse.js";
import { createGeminiAI } from "../modules/geminiai.js";

const T0 = Date.parse("2026-09-18T15:00:00.000Z");

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
    async reply(payload) {
      replies.push(payload);
      return payload;
    },
    async followUp(payload) {
      replies.push(payload);
      return payload;
    },
  };
}

function mockClient({ pulse, ownerId = "owner-1", guilds = [] } = {}) {
  const cache = new Map(guilds.map((g) => [g.id, g]));
  return {
    config: { botOwnerId: ownerId },
    usagePulse: pulse,
    logger: { log() {} },
    guilds: {
      cache,
    },
  };
}

describe("/usage command", () => {
  it("is an admin slash command with an owner-only all option", () => {
    const cmd = new Usage(mockClient());
    assert.equal(cmd.help.name, "usage");
    assert.equal(cmd.help.category, "admin");
    const json = cmd.data.toJSON();
    assert.ok(json.default_member_permissions);
    assert.equal(json.dm_permission, false);
    assert.ok((json.options || []).some((o) => o.name === "all"));
  });

  it("rejects non-admins and DMs", async () => {
    const pulse = createUsagePulse({ now: () => T0, flushMs: 0 });
    const cmd = new Usage(mockClient({ pulse }));

    const user = mockInteraction({ isAdmin: true, userId: "random-user" });
    user.memberPermissions.has = () => false;
    await cmd.execute(user);
    assert.match(user.replies[0].content, /server admins/i);
    assert.equal(user.replies[0].ephemeral, true);

    const dm = mockInteraction({ guildId: null, userId: "owner-1" });
    await cmd.execute(dm);
    assert.match(dm.replies[0].content, /server/i);
  });

  it("shows this guild's top commands and feature counts ephemerally", async () => {
    const pulse = createUsagePulse({ now: () => T0, flushMs: 0 });
    pulse.recordSlash("guild-1", "wiki");
    pulse.recordSlash("guild-1", "wiki");
    pulse.recordSlash("guild-1", "ping");
    pulse.recordEvent("guild-1", FEATURE_EVENTS.CONTEXT_PACK_INJECT);
    pulse.recordEvent("guild-1", FEATURE_EVENTS.IMAGE_GEN_SUCCESS);
    const cmd = new Usage(mockClient({ pulse }));
    const interaction = mockInteraction({ userId: "mod-1", isAdmin: true });
    await cmd.execute(interaction);
    const text = interaction.replies[0].content;
    assert.equal(interaction.replies[0].ephemeral, true);
    assert.match(text, /Alpha Pub/);
    assert.match(text, /\/wiki` — 2/);
    assert.match(text, /\/ping` — 1/);
    assert.match(text, /context-pack inject: 1/);
    assert.match(text, /image-gen success: 1/);
    assert.equal(text.includes("mod-1"), false);
    assert.equal(text.includes("guild-1"), false);
  });

  it("limits all-server rollup to the bot owner and omits guild ids", async () => {
    const pulse = createUsagePulse({ now: () => T0, flushMs: 0 });
    pulse.recordSlash("guild-1", "wiki");
    pulse.recordSlash("guild-2", "ping");
    const client = mockClient({
      pulse,
      guilds: [
        { id: "guild-1", name: "Alpha Pub" },
        { id: "guild-2", name: "Beta Den" },
      ],
    });
    const cmd = new Usage(client);

    const admin = mockInteraction({ userId: "mod-1", isAdmin: true, all: true });
    await cmd.execute(admin);
    assert.match(admin.replies[0].content, /bot owner/i);

    const owner = mockInteraction({ userId: "owner-1", isAdmin: false, all: true });
    await cmd.execute(owner);
    const text = owner.replies[0].content;
    assert.match(text, /all servers/i);
    assert.match(text, /Alpha Pub/);
    assert.match(text, /Beta Den/);
    assert.equal(text.includes("guild-1"), false);
    assert.equal(text.includes("guild-2"), false);
    assert.equal(text.includes("owner-1"), false);
  });

  it("treats bot owner and guild admins as viewers", () => {
    const client = mockClient();
    assert.equal(
      canViewUsage(client, mockInteraction({ userId: "owner-1", isAdmin: false })),
      true
    );
    assert.equal(
      canViewUsage(client, mockInteraction({ userId: "mod-1", isAdmin: true })),
      true
    );
    assert.equal(
      canViewUsage(client, mockInteraction({ userId: "user-1", isAdmin: false })),
      false
    );
  });
});

describe("usage pulse feature hooks", () => {
  it("records context-pack inject when a pack is attached", async () => {
    const pulse = createUsagePulse({ now: () => T0, flushMs: 0 });
    const ai = createGeminiAI({
      config: { geminiKey: "test" },
      usagePulse: pulse,
      logger: { log() {}, warn() {}, error() {} },
    });
    ai.contextPacks.attachIfNeeded = async (contents) => ({
      contents,
      attached: [{ name: "plays", kind: "plays" }],
      note: "attached",
    });
    await ai.attachGuildContextPacks([], { guild: { id: "guild-1" } });
    assert.equal(pulse.guildReport("guild-1").events.context_pack_inject, 1);

    ai.contextPacks.attachIfNeeded = async (contents) => ({
      contents,
      attached: [],
      note: "",
    });
    await ai.attachGuildContextPacks([], { guild: { id: "guild-1" } });
    assert.equal(pulse.guildReport("guild-1").events.context_pack_inject, 1);
  });

  it("records image-gen success and fail without storing the prompt", async () => {
    const pulse = createUsagePulse({ now: () => T0, flushMs: 0 });
    const ai = createGeminiAI({
      config: { geminiKey: "test" },
      usagePulse: pulse,
      user: { id: "bot" },
      logger: { log() {}, warn() {}, error() {} },
    });
    ai.generateImageNew = async () => ({ ok: true });
    await ai.processResponse(
      { candidates: [{ content: { parts: [{ text: "Hello.\nGenerating image of a secret prompt" }] } }] },
      "Bender",
      { guildId: "guild-1" }
    );
    ai.generateImageNew = async () => null;
    await ai.processResponse(
      { candidates: [{ content: { parts: [{ text: "Generating image of another secret" }] } }] },
      "Bender",
      { guildId: "guild-1" }
    );
    const report = pulse.guildReport("guild-1");
    assert.equal(report.events.image_gen_success, 1);
    assert.equal(report.events.image_gen_fail, 1);
    const snap = JSON.stringify(pulse.snapshot());
    assert.equal(snap.includes("secret prompt"), false);
    assert.equal(snap.includes("another secret"), false);
  });
});
