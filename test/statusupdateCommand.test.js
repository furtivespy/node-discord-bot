import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ActivityType, PermissionsBitField } from "discord.js";
import StatusUpdate from "../slashcommands/util/statusupdate.js";

function mockInteraction({
  userId = "owner-1",
  type = "PLAYING",
  activity = "QA test",
  url = null,
} = {}) {
  const replies = [];
  return {
    user: { id: userId },
    options: {
      getString(name) {
        if (name === "type") return type;
        if (name === "activity") return activity;
        if (name === "url") return url;
        return null;
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
    async followUp(payload) {
      replies.push(payload);
      return payload;
    },
  };
}

function mockClient({ ownerId = "owner-1" } = {}) {
  const setActivityCalls = [];
  return {
    config: {
      botOwnerId: ownerId,
      activity: "old",
      activityType: "WATCHING",
      activityUrl: "https://twitch.tv/old",
    },
    logger: { log() {} },
    user: {
      setActivity(...args) {
        setActivityCalls.push(args);
      },
    },
    setActivityCalls,
  };
}

describe("/statusupdate command", () => {
  it("is a hidden owner command with Administrator default permissions and type/activity options", () => {
    const cmd = new StatusUpdate(mockClient());
    assert.equal(cmd.help.name, "statusupdate");
    assert.equal(cmd.help.category, "admin");
    assert.equal(cmd.conf.hidden, true);
    assert.equal(cmd.conf.permLevel, "Bot Owner");
    const json = cmd.data.toJSON();
    assert.equal(
      json.default_member_permissions,
      String(PermissionsBitField.Flags.Administrator)
    );
    const typeOpt = (json.options || []).find((option) => option.name === "type");
    const activityOpt = (json.options || []).find((option) => option.name === "activity");
    const urlOpt = (json.options || []).find((option) => option.name === "url");
    assert.equal(typeOpt?.required, true);
    assert.equal(activityOpt?.required, true);
    assert.equal(urlOpt?.required, false);
    const choiceValues = (typeOpt?.choices || []).map((choice) => choice.value);
    assert.deepEqual(choiceValues, [
      "PLAYING",
      "LISTENING",
      "WATCHING",
      "STREAMING",
      "COMPETING",
    ]);
    assert.ok(!choiceValues.includes("CUSTOM"));
  });

  it("rejects everyone who is not the bot owner", async () => {
    const client = mockClient();
    const cmd = new StatusUpdate(client);
    const admin = mockInteraction({ userId: "admin-1" });
    await cmd.execute(admin);
    assert.equal(admin.replies[0].ephemeral, true);
    assert.match(admin.replies[0].content, /only for the bot owner/i);
    assert.equal(client.config.activity, "old");
    assert.equal(client.setActivityCalls.length, 0);

    const rando = mockInteraction({ userId: "rando" });
    await cmd.execute(rando);
    assert.match(rando.replies[0].content, /only for the bot owner/i);
    assert.equal(client.setActivityCalls.length, 0);
  });

  it("sets playing activity with ActivityType.Playing and persists the config strings", async () => {
    const client = mockClient();
    const cmd = new StatusUpdate(client);
    const interaction = mockInteraction({ type: "PLAYING", activity: "QA test" });
    await cmd.execute(interaction);
    assert.equal(client.config.activity, "QA test");
    assert.equal(client.config.activityType, "PLAYING");
    assert.equal(client.config.activityUrl, "");
    assert.deepEqual(client.setActivityCalls, [
      ["QA test", { type: ActivityType.Playing }],
    ]);
    assert.match(interaction.replies[0].content, /Playing/);
    assert.match(interaction.replies[0].content, /QA test/);
  });

  it("maps watching, listening, and competing choices to ActivityType enums", async () => {
    const cases = [
      { type: "WATCHING", enum: ActivityType.Watching, activity: "the game", label: "Watching" },
      { type: "LISTENING", enum: ActivityType.Listening, activity: "jazz", label: "Listening" },
      { type: "COMPETING", enum: ActivityType.Competing, activity: "trivia", label: "Competing" },
    ];
    for (const testCase of cases) {
      const client = mockClient();
      const cmd = new StatusUpdate(client);
      const interaction = mockInteraction({
        type: testCase.type,
        activity: testCase.activity,
      });
      await cmd.execute(interaction);
      assert.equal(client.config.activityType, testCase.type);
      assert.equal(client.config.activity, testCase.activity);
      assert.deepEqual(client.setActivityCalls, [
        [testCase.activity, { type: testCase.enum }],
      ]);
      assert.match(interaction.replies[0].content, new RegExp(testCase.label));
    }
  });

  it("requires a Twitch or YouTube url for Streaming instead of silently dropping it", async () => {
    const missing = mockClient();
    await new StatusUpdate(missing).execute(
      mockInteraction({ type: "STREAMING", activity: "live" })
    );
    assert.match(missing.config.activity, /old/);
    assert.equal(missing.config.activityType, "WATCHING");
    assert.equal(missing.setActivityCalls.length, 0);

    const badUrl = mockClient();
    const bad = mockInteraction({
      type: "STREAMING",
      activity: "live",
      url: "https://example.com/live",
    });
    await new StatusUpdate(badUrl).execute(bad);
    assert.match(bad.replies[0].content, /Twitch or YouTube/i);
    assert.equal(badUrl.setActivityCalls.length, 0);

    const client = mockClient();
    const ok = mockInteraction({
      type: "STREAMING",
      activity: "live",
      url: "https://twitch.tv/discord",
    });
    await new StatusUpdate(client).execute(ok);
    assert.equal(client.config.activity, "live");
    assert.equal(client.config.activityType, "STREAMING");
    assert.equal(client.config.activityUrl, "https://twitch.tv/discord");
    assert.deepEqual(client.setActivityCalls, [
      ["live", { type: ActivityType.Streaming, url: "https://twitch.tv/discord" }],
    ]);
  });

  it("fails clearly on an invalid type instead of defaulting to Playing", async () => {
    const client = mockClient();
    const cmd = new StatusUpdate(client);
    const interaction = mockInteraction({ type: "CUSTOM", activity: "secret" });
    await cmd.execute(interaction);
    assert.match(interaction.replies[0].content, /not supported/i);
    assert.equal(client.config.activity, "old");
    assert.equal(client.config.activityType, "WATCHING");
    assert.equal(client.setActivityCalls.length, 0);
  });
});
