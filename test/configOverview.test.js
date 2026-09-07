const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isConfigAdmin,
  redactSetting,
  collectGuildSnapshot,
  buildOverviewReport,
  splitDiscordMessages,
} = require("../modules/configOverview");

const DEFAULTS = {
  prefix: "!",
  randRspPct: 2,
  markovLevel: "4",
  adminRole: "Admin",
  modRole: "Mod",
  systemNotice: "true",
};

function mockClient({ guilds = [], settingsByGuild = {}, databases = {} } = {}) {
  const settingsStore = { default: DEFAULTS, ...settingsByGuild };
  return {
    config: {
      botOwnerId: "owner-1",
      adminIds: ["admin-2"],
      defaultSettings: DEFAULTS,
    },
    settings: {
      get(key) {
        return settingsStore[key];
      },
    },
    getSettings(guild) {
      return { ...DEFAULTS, ...(settingsStore[guild.id] || {}) };
    },
    getExclusions(guild) {
      return (settingsStore[guild.id] && settingsStore[guild.id]._exclusions) || [];
    },
    getSkipChannels(guild) {
      return (settingsStore[guild.id] && settingsStore[guild.id]._skip) || [];
    },
    getGameData(guild, game) {
      if (game !== "STARBOARD") return {};
      return (settingsStore[guild.id] && settingsStore[guild.id]._starboard) || {};
    },
    getDatabase(id) {
      if (databases[id] === "throw") throw new Error("db missing");
      return (
        databases[id] || {
          hasFileSearchReady: () => false,
          getFileSearchStore: () => null,
          getTranscriptSummary: () => ({ uploaded: 0 }),
          listPeople: () => [],
          getBackfillWorker: () => ({ status: "paused" }),
        }
      );
    },
    guilds: { cache: guilds },
  };
}

describe("isConfigAdmin", () => {
  const config = { botOwnerId: "owner-1", adminIds: ["admin-2"], admins: ["legacy-3"] };

  it("allows botOwnerId and configured admin lists", () => {
    assert.equal(isConfigAdmin("owner-1", config), true);
    assert.equal(isConfigAdmin("admin-2", config), true);
    assert.equal(isConfigAdmin("legacy-3", config), true);
  });

  it("rejects everyone else", () => {
    assert.equal(isConfigAdmin("random", config), false);
    assert.equal(isConfigAdmin("", config), false);
    assert.equal(isConfigAdmin(null, config), false);
  });
});

describe("redactSetting", () => {
  it("redacts URLs and secret-looking keys without printing them", () => {
    const url = redactSetting("publishedCsvUrl", "https://secret.example/pack.csv?token=abc");
    assert.equal(url.configured, true);
    assert.equal(url.display, "yes (redacted)");
    assert.equal(url.display.includes("secret.example"), false);
    assert.equal(url.display.includes("token=abc"), false);

    const token = redactSetting("geminiKey", "super-secret");
    assert.equal(token.display, "yes (redacted)");
    assert.equal(token.display.includes("super-secret"), false);
  });

  it("marks empty values as missing", () => {
    assert.deepEqual(redactSetting("csvUrl", ""), { configured: false, display: "no" });
    assert.deepEqual(redactSetting("csvUrl", null), { configured: false, display: "no" });
  });

  it("passes through ordinary values", () => {
    assert.deepEqual(redactSetting("prefix", "!"), { configured: true, display: "!" });
  });
});

describe("collectGuildSnapshot / buildOverviewReport", () => {
  it("labels defaults, missing context pack, and unset mention cooldown", () => {
    const guild = { id: "g1", name: "Alpha" };
    const client = mockClient({ guilds: [guild] });
    const snap = collectGuildSnapshot(client, guild);

    assert.equal(snap.personality.set, false);
    assert.equal(snap.personality.key, "bender");
    assert.equal(snap.mentionCooldown, "no (not stored)");
    assert.equal(snap.contextPack, "no");
    assert.equal(snap.fileSearchReady, false);
    assert.equal(snap.prefix.override, false);
    assert.equal(snap.randRspPct.value, 2);

    const report = buildOverviewReport(client).text;
    assert.match(report, /no \(default Bender \(Default\)\)/);
    assert.match(report, /prefix ! \(default\)/);
    assert.match(report, /randRsp 2% \(default\)/);
    assert.match(report, /mention cooldown: no \(not stored\)/);
    assert.match(report, /Context pack \/ CSV: no/);
    assert.match(report, /File Search ready: no/);
    assert.equal(report.includes("https://"), false);
  });

  it("shows personality preview and redacts a published CSV URL", () => {
    const guild = { id: "g2", name: "Beta" };
    const client = mockClient({
      guilds: [guild],
      settingsByGuild: {
        g2: {
          ai_selected_personality: "detective",
          publishedCsvUrl: "https://s3.example/guild/secret.csv",
          mentionCooldown: 120000,
          randRspPct: 0,
          _exclusions: ["frozen"],
          _skip: ["c1", "c2"],
          _starboard: { starboardChannelId: "99", starboardChannel: "stars" },
        },
      },
      databases: {
        g2: {
          hasFileSearchReady: () => true,
          getFileSearchStore: () => "stores/abc",
          getTranscriptSummary: () => ({ uploaded: 7 }),
          listPeople: () => [{ user_id: "1" }, { user_id: "2" }],
          getBackfillWorker: () => ({ status: "watching" }),
        },
      },
    });

    const snap = collectGuildSnapshot(client, guild);
    assert.equal(snap.personality.set, true);
    assert.equal(snap.personality.label, "Hardboiled AI Detective");
    assert.equal(snap.contextPack, "yes (redacted)");
    assert.equal(snap.mentionCooldown, "120000");
    assert.equal(snap.fileSearchReady, true);
    assert.equal(snap.starboard.configured, true);
    assert.deepEqual(snap.exclusions, ["frozen"]);
    assert.equal(snap.skipChannelCount, 2);

    const report = buildOverviewReport(client).text;
    assert.match(report, /Hardboiled AI Detective/);
    assert.match(report, /Context pack \/ CSV: yes \(redacted\)/);
    assert.match(report, /File Search ready: yes \(7 uploaded\)/);
    assert.match(report, /mention cooldown: 120000/);
    assert.match(report, /starboard #stars/);
    assert.match(report, /disabled: frozen/);
    assert.equal(report.includes("s3.example"), false);
    assert.equal(report.includes("secret.csv"), false);
    assert.equal(report.includes("stores/abc"), false);
  });

  it("redacts leftover secret overrides and marks File Search errors", () => {
    const guild = { id: "g3", name: "Gamma" };
    const client = mockClient({
      guilds: [guild],
      settingsByGuild: {
        g3: {
          leftoverToken: "abc123token",
          webhookUrl: "https://discord.com/api/webhooks/1/2",
        },
      },
      databases: { g3: "throw" },
    });
    const snap = collectGuildSnapshot(client, guild);
    assert.ok(snap.otherOverrides.includes("leftoverToken=yes (redacted)"));
    assert.ok(snap.otherOverrides.includes("webhookUrl=yes (redacted)"));
    assert.equal(snap.fileSearchError, "unavailable");

    const report = buildOverviewReport(client).text;
    assert.equal(report.includes("abc123token"), false);
    assert.equal(report.includes("webhooks/1/2"), false);
    assert.match(report, /File Search ready: unavailable/);
  });

  it("lists every joined guild", () => {
    const client = mockClient({
      guilds: [
        { id: "2", name: "Zebra" },
        { id: "1", name: "Aardvark" },
      ],
    });
    const { text, snapshots } = buildOverviewReport(client);
    assert.equal(snapshots.length, 2);
    assert.match(text, /2 guilds/);
    assert.ok(text.indexOf("Aardvark") < text.indexOf("Zebra"));
  });
});

describe("/config overview command", () => {
  function mockInteraction({ userId, subcommand = "overview" }) {
    const replies = [];
    return {
      user: { id: userId },
      options: {
        getSubcommand: () => subcommand,
      },
      replies,
      deferred: false,
      replied: false,
      async reply(payload) {
        this.replied = true;
        replies.push({ type: "reply", ...payload });
        return payload;
      },
      async deferReply(payload) {
        this.deferred = true;
        replies.push({ type: "defer", ...payload });
      },
      async editReply(payload) {
        replies.push({ type: "edit", ...payload });
        return payload;
      },
      async followUp(payload) {
        replies.push({ type: "followUp", ...payload });
        return payload;
      },
    };
  }

  it("rejects non-admins with an ephemeral reply and does not build a report", async () => {
    const Config = require("../slashcommands/util/config.js");
    const client = mockClient({
      guilds: [{ id: "g1", name: "Alpha" }],
    });
    client.logger = { log() {} };
    const cmd = new Config(client);
    const interaction = mockInteraction({ userId: "not-an-admin" });
    await cmd.execute(interaction);
    assert.equal(interaction.replies.length, 1);
    assert.equal(interaction.replies[0].ephemeral, true);
    assert.match(interaction.replies[0].content, /bot owner/);
    assert.equal(interaction.deferred, false);
  });

  it("sends an ephemeral overview for the bot owner", async () => {
    const Config = require("../slashcommands/util/config.js");
    const logs = [];
    const client = mockClient({
      guilds: [{ id: "g1", name: "Alpha" }],
    });
    client.logger = {
      log(content) {
        logs.push(String(content));
      },
    };
    const cmd = new Config(client);
    const interaction = mockInteraction({ userId: "owner-1" });
    await cmd.execute(interaction);
    assert.equal(interaction.deferred, true);
    assert.equal(interaction.replies[0].ephemeral, true);
    const edit = interaction.replies.find((r) => r.type === "edit");
    assert.ok(edit);
    assert.match(edit.content, /Alpha/);
    assert.match(edit.content, /File Search ready: no/);
    assert.ok(logs.some((line) => line.includes("config overview requested by owner-1")));
    assert.ok(logs.every((line) => !line.includes("https://")));
  });
});

describe("splitDiscordMessages", () => {
  it("keeps short reports in one message", () => {
    assert.deepEqual(splitDiscordMessages("hello", 20), ["hello"]);
  });

  it("splits long reports on paragraph boundaries", () => {
    const text = `${"a".repeat(30)}\n\n${"b".repeat(30)}`;
    const chunks = splitDiscordMessages(text, 40);
    assert.equal(chunks.length, 2);
    assert.ok(chunks.every((chunk) => chunk.length <= 40));
    assert.equal(chunks.join("\n\n").replace(/\n+/g, "\n\n"), text);
  });
});
