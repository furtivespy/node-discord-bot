import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ActivityType } from "discord.js";
import {
  applyBotActivity,
  isStreamingUrl,
  parseStatusUpdateType,
  resolveActivityType,
  STATUS_UPDATE_CHOICES,
} from "../modules/botActivity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

describe("parseStatusUpdateType", () => {
  it("accepts dropdown values and rejects types not offered by /statusupdate", () => {
    assert.equal(parseStatusUpdateType("PLAYING"), "PLAYING");
    assert.equal(parseStatusUpdateType(" watching "), "WATCHING");
    assert.equal(parseStatusUpdateType("STREAMING"), "STREAMING");
    assert.equal(parseStatusUpdateType("COMPETING"), "COMPETING");
    assert.equal(parseStatusUpdateType("CUSTOM"), null);
    assert.equal(parseStatusUpdateType("nope"), null);
    assert.equal(parseStatusUpdateType(""), null);
    assert.equal(parseStatusUpdateType(undefined), null);
  });

  it("offers playing, listening, watching, streaming, and competing", () => {
    assert.deepEqual(
      STATUS_UPDATE_CHOICES.map((choice) => choice.value),
      ["PLAYING", "LISTENING", "WATCHING", "STREAMING", "COMPETING"]
    );
  });
});

describe("isStreamingUrl", () => {
  it("accepts Twitch and YouTube links and rejects other URLs", () => {
    assert.equal(isStreamingUrl("https://twitch.tv/discord"), true);
    assert.equal(isStreamingUrl("https://www.twitch.tv/discord"), true);
    assert.equal(isStreamingUrl("https://www.youtube.com/watch?v=abc"), true);
    assert.equal(isStreamingUrl("https://youtu.be/abc"), true);
    assert.equal(isStreamingUrl("https://example.com/live"), false);
    assert.equal(isStreamingUrl("not a url"), false);
    assert.equal(isStreamingUrl(""), false);
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

  it("passes a streaming url through so stored STREAMING config can show after restart", () => {
    const calls = [];
    const user = {
      setActivity(...args) {
        calls.push(args);
      },
    };
    applyBotActivity(user, "live", "STREAMING", { url: "https://twitch.tv/discord" });
    assert.deepEqual(calls, [
      ["live", { type: ActivityType.Streaming, url: "https://twitch.tv/discord" }],
    ]);
  });
});

describe("prefix !status command", () => {
  it("is removed", () => {
    const statusPath = path.join(__dirname, "..", "commands", "util", "Status.js");
    assert.equal(fs.existsSync(statusPath), false);
  });
});
