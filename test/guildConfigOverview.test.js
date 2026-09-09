import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBotAdmin,
  PERSONALITY_NAMES,
  redactSettingValue,
  looksLikeUrl,
  looksLikeSecretValue,
  isSecretKey,
  isContextPackKey,
  buildGuildSnapshot,
  collectAllGuildOverviews,
  formatOverviewText,
  formatOverviewJson,
  splitDiscordMessages,
} from "../modules/guildConfigOverview.js";
import Config from "../slashcommands/util/config.js";
import SetPersonality from "../slashcommands/util/setpersonality.js";

function snapshot(overrides = {}) {
  return buildGuildSnapshot({
    guildId: "111",
    guildName: "Alpha Pub",
    settings: {
      prefix: "!",
      randRspPct: 2,
      markovLevel: "4",
      ai_selected_personality: "bender",
    },
    overrides: {},
    ...overrides,
  });
}

describe("guildConfigOverview helpers", () => {
  it("treats botOwnerId, admins, adminIds, and app owner as admins", () => {
    const client = {
      config: { botOwnerId: "owner-1", admins: ["a1"], adminIds: ["a2"] },
      appInfo: { owner: { id: "app-owner" } },
    };
    assert.equal(isBotAdmin(client, "owner-1"), true);
    assert.equal(isBotAdmin(client, "a1"), true);
    assert.equal(isBotAdmin(client, "a2"), true);
    assert.equal(isBotAdmin(client, "app-owner"), true);
    assert.equal(isBotAdmin(client, "random-user"), false);
    assert.equal(isBotAdmin(client, null), false);
  });

  it("redacts tokens and URLs without printing them", () => {
    assert.equal(looksLikeUrl("https://bucket.s3.amazonaws.com/plays.csv?sig=abc"), true);
    assert.equal(isSecretKey("geminiKey"), true);
    assert.equal(isSecretKey("google_key"), true);
    assert.equal(isContextPackKey("publishedCsvUrl"), true);
    assert.equal(redactSettingValue("publishedCsvUrl", "https://secret.example/file.csv"), "configured");
    assert.equal(redactSettingValue("token", "abc.def.ghi"), "configured");
    assert.equal(redactSettingValue("welcomeMessage", "https://example.com/x"), "configured");
    assert.equal(redactSettingValue("prefix", "!"), "!");
    assert.equal(redactSettingValue("randRspPct", 0), "0");
    assert.equal(looksLikeUrl("ftp://bucket/secret.csv"), true);
    assert.equal(looksLikeSecretValue("EAABwNotARealTokenValue"), true);
    assert.equal(redactSettingValue("notes", "EAABwNotARealTokenValue"), "configured");
    assert.equal(redactSettingValue("notes", "ftp://bucket/secret.csv"), "configured");
    assert.equal(redactSettingValue("mentionCooldown", "sk-live-not-a-real-secret"), "configured");
    assert.equal(redactSettingValue("welcomeMessage", "Say hello to everyone"), "Say hello to everyone");
  });
});

describe("buildGuildSnapshot", () => {
  it("marks missing personality and chat knobs as defaults", () => {
    const row = snapshot();
    assert.equal(row.personality.set, false);
    assert.equal(row.personality.key, "bender");
    assert.match(row.personality.preview, /Bender/);
    assert.equal(row.prefix.source, "default");
    assert.equal(row.mentionCooldown.configured, false);
    assert.equal(row.mentionCooldown.display, "unset (prompt-only)");
    assert.equal(row.contextPack.configured, false);
    assert.equal(row.fileSearch.ready, false);
    assert.equal(row.starboard.configured, false);
    assert.equal(row.adminRole.value, "unset");
    assert.equal(row.modRole.value, "unset");
    assert.equal(row.systemNotice.value, "unset");
    const unsetText = formatOverviewText([row]);
    assert.match(unsetText, /Roles: admin unset \(default\) · mod unset \(default\) · systemNotice unset \(default\)/);
  });

  it("shows adminRole, modRole, and systemNotice instead of dropping them", () => {
    const row = snapshot({
      settings: {
        prefix: "!",
        randRspPct: 2,
        markovLevel: "4",
        ai_selected_personality: "bender",
        adminRole: "CoolGuys",
        modRole: "JuniorMods",
        systemNotice: "false",
      },
      overrides: {
        adminRole: "CoolGuys",
        modRole: "JuniorMods",
        systemNotice: "false",
      },
    });
    assert.equal(row.adminRole.value, "CoolGuys");
    assert.equal(row.adminRole.source, "override");
    assert.equal(row.modRole.value, "JuniorMods");
    assert.equal(row.systemNotice.value, "false");
    assert.equal(
      row.extras.some((item) => ["adminRole", "modRole", "systemNotice"].includes(item.key)),
      false
    );
    const text = formatOverviewText([row]);
    assert.match(text, /Roles: admin CoolGuys · mod JuniorMods · systemNotice false/);
    assert.doesNotMatch(text, /admin CoolGuys \(default\)/);
    const json = formatOverviewJson([row]);
    assert.match(json, /"adminRole"/);
    assert.match(json, /CoolGuys/);
  });

  it("shows overridden personality and redacts context pack URLs", () => {
    const row = snapshot({
      settings: {
        prefix: "?",
        randRspPct: 10,
        markovLevel: "5",
        ai_selected_personality: "detective",
        publishedCsvUrl: "https://secret.example/plays.csv?token=abc",
        mentionCooldown: "120s",
      },
      overrides: {
        prefix: "?",
        randRspPct: 10,
        markovLevel: "5",
        ai_selected_personality: "detective",
        publishedCsvUrl: "https://secret.example/plays.csv?token=abc",
        mentionCooldown: "120s",
        google_key: "not-a-real-key",
      },
    });
    assert.equal(row.personality.set, true);
    assert.equal(row.personality.key, "detective");
    assert.equal(row.personality.source, "override");
    assert.equal(row.contextPack.configured, true);
    assert.deepEqual(row.contextPack.keys, ["publishedCsvUrl"]);
    assert.equal(row.mentionCooldown.configured, true);
    assert.equal(row.mentionCooldown.display, "120s");
    assert.ok(row.extras.some((item) => item.key === "google_key" && item.value === "configured"));
    const text = formatOverviewText([row]);
    assert.doesNotMatch(text, /secret\.example/);
    assert.doesNotMatch(text, /not-a-real-key/);
    assert.match(text, /Context pack: yes/);
    assert.match(text, /Personality: Hardboiled AI Detective/);
    assert.doesNotMatch(text, /Hardboiled AI Detective \(default\)/);
  });

  it("treats FUR-62 context_packs as configured without printing the URL", () => {
    const secret = "https://docs.google.com/spreadsheets/d/e/2PACX-secret/pub?output=csv";
    const row = snapshot({
      settings: {
        context_packs: [{ name: "plays", kind: "plays", url: secret }],
      },
      overrides: {
        context_packs: [{ name: "plays", kind: "plays", url: secret }],
      },
    });
    assert.equal(row.contextPack.configured, true);
    assert.ok(row.contextPack.keys.includes("context_packs"));
    assert.equal(
      row.extras.some((item) => item.key === "context_packs"),
      false
    );
    const text = formatOverviewText([row]);
    assert.match(text, /Context pack: yes/);
    assert.doesNotMatch(text, /2PACX/);
    assert.doesNotMatch(text, /docs\.google\.com/);
    assert.equal(snapshot({ overrides: { context_packs: [] } }).contextPack.configured, false);
  });

  it("reports File Search ready and starboard when configured", () => {
    const row = snapshot({
      fileSearchReady: true,
      fileSearchStore: true,
      transcriptUploaded: 12,
      backfillStatus: "watching",
      peopleCount: 4,
      starboard: { starboardChannel: "stars", starEmoji: "⭐", minimumStarCount: 3 },
      bringo: { isGameActive: true, wordlist: ["bingo", "bango"] },
      exclusions: ["frozen"],
      skipChannels: ["c1", "c2"],
    });
    const text = formatOverviewText([row]);
    assert.match(text, /File Search: ready \(12 uploaded\)/);
    assert.match(text, /backfill watching/);
    assert.match(text, /people 4/);
    assert.match(text, /Starboard: #stars/);
    assert.match(text, /Bringo: active \(2 words\)/);
    assert.match(text, /Disabled cmds: frozen/);
    assert.match(text, /skip channels: 2/);
  });
});

describe("collect + format", () => {
  it("collects one row per guild and keeps JSON redacted", () => {
    const client = {
      config: { defaultSettings: { prefix: "!", randRspPct: 2, markovLevel: "4" } },
      settings: {
        get(id) {
          if (id === "default") return { prefix: "!", randRspPct: 2, markovLevel: "4" };
          if (id === "222") {
            return {
              ai_selected_personality: "chicago_pope",
              csvUrl: "https://do-not-print.example/pack.csv",
            };
          }
          return {};
        },
      },
      getExclusions: () => [],
      getSkipChannels: () => [],
      getGameData: () => ({}),
      getDatabase() {
        return {
          hasFileSearchReady: () => false,
          getTranscriptSummary: () => ({ uploaded: 0 }),
          getBackfillWorker: () => ({ status: "paused" }),
          listPeople: () => [],
        };
      },
    };
    const rows = collectAllGuildOverviews(client, [
      { id: "222", name: "Zeta" },
      { id: "111", name: "Alpha" },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, "Alpha");
    assert.equal(rows[1].name, "Zeta");
    assert.equal(rows[1].contextPack.configured, true);
    const json = formatOverviewJson(rows);
    assert.doesNotMatch(json, /do-not-print\.example/);
    assert.match(json, /"configured": true/);
  });

  it("rejects non-admins and replies ephemerally for owners", async () => {
    const replies = [];
    const logs = [];
    const client = {
      config: { botOwnerId: "owner-1", defaultSettings: { prefix: "!" } },
      settings: {
        get(id) {
          return id === "default" ? { prefix: "!", randRspPct: 2, markovLevel: "4" } : {};
        },
      },
      guilds: {
        cache: new Map([["111", { id: "111", name: "Alpha" }]]),
        async fetch() {},
      },
      getExclusions: () => [],
      getSkipChannels: () => [],
      getGameData: () => ({}),
      getDatabase() {
        return {
          hasFileSearchReady: () => true,
          getTranscriptSummary: () => ({ uploaded: 3 }),
          getBackfillWorker: () => ({ status: "watching", file_search_store: "store/x" }),
          listPeople: () => [{ user_id: "1" }],
        };
      },
      logger: { log(content) { logs.push(String(content)); } },
    };
    const cmd = new Config(client);

    const denied = {
      user: { id: "random" },
      options: { getSubcommand: () => "overview", getString: () => null, getBoolean: () => false },
      async reply(payload) { replies.push(payload); },
    };
    await cmd.execute(denied);
    assert.equal(replies[0].ephemeral, true);
    assert.match(replies[0].content, /only for the bot owner/);

    const allowedReplies = [];
    const allowed = {
      user: { id: "owner-1" },
      options: {
        getSubcommand: () => "overview",
        getString: () => "text",
        getBoolean: () => true,
      },
      deferred: false,
      async deferReply(payload) {
        assert.equal(payload.ephemeral, true);
        this.deferred = true;
      },
      async editReply(payload) { allowedReplies.push(payload); },
      async followUp() { throw new Error("should not follow up for a short report"); },
    };
    await cmd.execute(allowed);
    assert.equal(allowedReplies.length, 1);
    assert.match(allowedReplies[0].content, /Alpha/);
    assert.match(allowedReplies[0].content, /File Search: ready/);
    assert.doesNotMatch(allowedReplies[0].content, /store\/x/);
    assert.ok(logs.some((entry) => String(entry.content || entry).includes("config overview requested by owner-1")));
  });

  it("replies with an ephemeral error after deferReply instead of hanging", async () => {
    const replies = [];
    const logs = [];
    const client = {
      config: { botOwnerId: "owner-1", defaultSettings: { prefix: "!" } },
      settings: { get: () => ({}) },
      guilds: {
        cache: {
          size: 1,
          values() {
            throw new Error("cache exploded");
          },
        },
        async fetch() {},
      },
      logger: {
        log(content, type) {
          logs.push({ content: String(content), type });
        },
      },
    };
    const cmd = new Config(client);
    const interaction = {
      user: { id: "owner-1" },
      deferred: false,
      replied: false,
      options: { getSubcommand: () => "overview", getString: () => "text", getBoolean: () => false },
      async deferReply(payload) {
        assert.equal(payload.ephemeral, true);
        this.deferred = true;
      },
      async editReply(payload) {
        replies.push({ type: "edit", ...payload });
      },
      async followUp(payload) {
        replies.push({ type: "follow", ...payload });
      },
      async reply(payload) {
        replies.push({ type: "reply", ...payload });
      },
    };
    await cmd.execute(interaction);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].type, "edit");
    assert.equal(replies[0].ephemeral, true);
    assert.match(replies[0].content, /Something went wrong/);
    assert.ok(logs.some((entry) => entry.type === "error"));
  });

  it("warns when guilds.fetch fails and still reports the cache", async () => {
    const replies = [];
    const logs = [];
    const client = {
      config: { botOwnerId: "owner-1", defaultSettings: { prefix: "!" } },
      settings: {
        get(id) {
          return id === "default" ? { prefix: "!", randRspPct: 2, markovLevel: "4" } : {};
        },
      },
      guilds: {
        cache: new Map([["111", { id: "111", name: "Alpha" }]]),
        async fetch() {
          throw new Error("discord timeout");
        },
      },
      getExclusions: () => [],
      getSkipChannels: () => [],
      getGameData: () => ({}),
      getDatabase() {
        return {
          hasFileSearchReady: () => false,
          getTranscriptSummary: () => ({ uploaded: 0 }),
          getBackfillWorker: () => ({ status: "paused" }),
          listPeople: () => [],
        };
      },
      logger: {
        log(content, type) {
          logs.push({ content: String(content), type });
        },
      },
    };
    const cmd = new Config(client);
    const interaction = {
      user: { id: "owner-1" },
      deferred: false,
      options: { getSubcommand: () => "overview", getString: () => "text", getBoolean: () => false },
      async deferReply() {
        this.deferred = true;
      },
      async editReply(payload) {
        replies.push(payload);
      },
      async followUp() {
        throw new Error("should not follow up for a short report");
      },
    };
    await cmd.execute(interaction);
    assert.equal(replies.length, 1);
    assert.match(replies[0].content, /could not refresh the guild list/i);
    assert.match(replies[0].content, /Alpha/);
    assert.ok(
      logs.some(
        (entry) =>
          entry.type === "warn" && /guilds\.fetch failed/.test(entry.content) && /discord timeout/.test(entry.content)
      )
    );
  });

  it("shares PERSONALITY_NAMES with /setpersonality choices", () => {
    const cmd = new SetPersonality({ config: {} });
    const setSub = (cmd.data.options || []).find((option) => option.name === "set");
    const personality = (setSub.options || []).find((option) => option.name === "personality");
    const values = (personality.choices || []).map((choice) => choice.value);
    assert.deepEqual(values.sort(), Object.keys(PERSONALITY_NAMES).sort());
    assert.ok((personality.choices || []).some((choice) => choice.value === "bender" && /Default/.test(choice.name)));
  });

  it("splits long reports on paragraph boundaries", () => {
    const long = `${"A".repeat(100)}\n\n${"B".repeat(100)}\n\n${"C".repeat(100)}`;
    const chunks = splitDiscordMessages(long, 150);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((chunk) => chunk.length <= 150));
    assert.equal(chunks.join("\n\n").replace(/\n\n/g, ""), long.replace(/\n\n/g, ""));
  });
});
