import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ActivityType } from "discord.js";
import Status from "../commands/util/Status.js";
import { applyBotActivity, resolveActivityType } from "../modules/botActivity.js";

function mockClient() {
  const setActivityCalls = [];
  return {
    config: { activity: "old", activityType: "WATCHING" },
    logger: { log() {} },
    user: {
      setActivity(...args) {
        setActivityCalls.push(args);
      },
    },
    setActivityCalls,
  };
}

function mockMessage() {
  const reacts = [];
  return {
    async react(emoji) {
      reacts.push(emoji);
    },
    reacts,
  };
}

describe("resolveActivityType", () => {
  it("maps existing config strings to discord.js ActivityType enums", () => {
    assert.equal(resolveActivityType("PLAYING"), ActivityType.Playing);
    assert.equal(resolveActivityType("STREAMING"), ActivityType.Streaming);
    assert.equal(resolveActivityType("LISTENING"), ActivityType.Listening);
    assert.equal(resolveActivityType("WATCHING"), ActivityType.Watching);
    assert.equal(resolveActivityType("COMPETING"), ActivityType.Competing);
    assert.equal(resolveActivityType("CUSTOM"), ActivityType.Custom);
  });

  it("accepts mixed-case names, numeric enums, and defaults unknown values to Playing", () => {
    assert.equal(resolveActivityType("playing"), ActivityType.Playing);
    assert.equal(resolveActivityType(" Watching "), ActivityType.Watching);
    assert.equal(resolveActivityType(ActivityType.Listening), ActivityType.Listening);
    assert.equal(resolveActivityType(0), ActivityType.Playing);
    assert.equal(resolveActivityType(3), ActivityType.Watching);
    assert.equal(resolveActivityType("nope"), ActivityType.Playing);
    assert.equal(resolveActivityType(""), ActivityType.Playing);
    assert.equal(resolveActivityType(undefined), ActivityType.Playing);
  });
});

describe("applyBotActivity", () => {
  it("calls setActivity with the mapped ActivityType so startup config strings work", () => {
    const calls = [];
    const user = {
      setActivity(...args) {
        calls.push(args);
      },
    };
    applyBotActivity(user, "QA test", "PLAYING");
    assert.deepEqual(calls, [["QA test", { type: ActivityType.Playing }]]);
  });
});

describe("!status command", () => {
  it("sets playing activity with ActivityType.Playing and keeps the config string", async () => {
    const client = mockClient();
    const message = mockMessage();
    await new Status(client).run(message, ["playing", "QA", "test"], 0);
    assert.equal(client.config.activity, "QA test");
    assert.equal(client.config.activityType, "PLAYING");
    assert.deepEqual(client.setActivityCalls, [
      ["QA test", { type: ActivityType.Playing }],
    ]);
    assert.deepEqual(message.reacts, ["⚡"]);
  });

  it("maps watching, listening, and streaming command prefixes to ActivityType enums", async () => {
    const cases = [
      { args: ["watching", "the", "game"], type: "WATCHING", enum: ActivityType.Watching, activity: "the game" },
      { args: ["listen", "jazz"], type: "LISTENING", enum: ActivityType.Listening, activity: "jazz" },
      { args: ["stream", "live"], type: "STREAMING", enum: ActivityType.Streaming, activity: "live" },
    ];
    for (const testCase of cases) {
      const client = mockClient();
      const message = mockMessage();
      await new Status(client).run(message, testCase.args, 0);
      assert.equal(client.config.activityType, testCase.type);
      assert.equal(client.config.activity, testCase.activity);
      assert.deepEqual(client.setActivityCalls, [
        [testCase.activity, { type: testCase.enum }],
      ]);
    }
  });

  it("defaults a bare status text to playing", async () => {
    const client = mockClient();
    const message = mockMessage();
    await new Status(client).run(message, ["QA", "test"], 0);
    assert.equal(client.config.activity, "QA test");
    assert.equal(client.config.activityType, "PLAYING");
    assert.deepEqual(client.setActivityCalls, [
      ["QA test", { type: ActivityType.Playing }],
    ]);
  });

  it("does nothing when no status text is given", async () => {
    const client = mockClient();
    const message = mockMessage();
    await new Status(client).run(message, [], 0);
    assert.equal(client.config.activity, "old");
    assert.equal(client.setActivityCalls.length, 0);
    assert.equal(message.reacts.length, 0);
  });
});
