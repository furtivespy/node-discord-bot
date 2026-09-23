import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Collection } from "discord.js";
import { HEALTH } from "../modules/contextPackFreshness.js";
import { createUsagePulse, FEATURE_EVENTS } from "../modules/usagePulse.js";
import {
  canViewHealth,
  collectGuildHealth,
  createImageGenProbe,
  formatAllGuildsHealth,
  formatDuration,
  formatHealthDescription,
  inferImageGenHealth,
  rememberSlashRegistration,
  scrubHealthDetail,
} from "../modules/guildHealth.js";
import { createGeminiAI } from "../modules/geminiai.js";

const SECRET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vThisIsASecretToken/pub?output=csv";
const SECRET_KEY = "AIzaSyNotARealGeminiKeyValue0000000000";

const PLAYS = {
  name: "plays",
  kind: "plays",
  url: SECRET_URL,
  last_result: "ok",
  last_ok_at: 1_700_000_000_000,
  last_attempt_at: 1_700_000_000_000,
  last_row_count: 12,
};

function mockClient({
  packs = [],
  settings = {},
  imageEvents = {},
  slashNote,
  ready = true,
  ping = 42,
  geminiKey = SECRET_KEY,
  slashCount = 12,
} = {}) {
  const store = { "guild-1": { context_packs: packs, ...settings } };
  const pulse = createUsagePulse({ now: () => Date.parse("2026-09-23T03:00:00.000Z"), flushMs: 0 });
  for (let i = 0; i < (imageEvents.ok || 0); i++) {
    pulse.recordEvent("guild-1", FEATURE_EVENTS.IMAGE_GEN_SUCCESS);
  }
  for (let i = 0; i < (imageEvents.fail || 0); i++) {
    pulse.recordEvent("guild-1", FEATURE_EVENTS.IMAGE_GEN_FAIL);
  }
  const slashcommands = new Collection();
  for (let i = 0; i < slashCount; i++) slashcommands.set(`cmd${i}`, { help: { name: `cmd${i}` } });
  const client = {
    config: { botOwnerId: "owner-1", geminiKey, clientId: "client-1" },
    usagePulse: pulse,
    imageGenProbe: createImageGenProbe(),
    slashcommands,
    readyAt: ready ? new Date() : null,
    uptime: 3 * 60 * 60 * 1000,
    isReady: () => ready,
    ws: { ping, shards: { size: 1 } },
    settings: {
      get(id) {
        return store[id];
      },
    },
    getSettings(guild) {
      return { ...(store[guild.id] || {}) };
    },
    geminiAI: {
      contextPacks: {
        getUrlStatus() {
          return { ttlMs: 10 * 60 * 1000 };
        },
      },
    },
  };
  if (slashNote) rememberSlashRegistration(client, slashNote);
  return client;
}

describe("guild health snapshot", () => {
  it("maps image-gen last result and 7-day counts without inventing extra storage", () => {
    assert.equal(inferImageGenHealth({ enabled: false }), HEALTH.missing);
    assert.equal(inferImageGenHealth({ enabled: true }), HEALTH.never);
    assert.equal(
      inferImageGenHealth({ enabled: true, last_result: "ok", last_ok_at: 1, last_attempt_at: 1 }),
      HEALTH.healthy
    );
    assert.equal(
      inferImageGenHealth({
        enabled: true,
        last_result: "error",
        last_ok_at: 1,
        last_attempt_at: 2,
        failCount: 1,
        okCount: 3,
      }),
      HEALTH.stale
    );
    assert.equal(
      inferImageGenHealth({ enabled: true, last_result: "error", last_attempt_at: 1, failCount: 2 }),
      HEALTH.broken
    );
    assert.equal(inferImageGenHealth({ enabled: true, okCount: 4, failCount: 0 }), HEALTH.healthy);
    assert.equal(inferImageGenHealth({ enabled: true, okCount: 1, failCount: 2 }), HEALTH.stale);
  });

  it("composes pack freshness fields and paints green when everything is up", () => {
    const client = mockClient({
      packs: [PLAYS],
      slashNote: { ok: true, loaded: 12, registered: 12, at: 1_700_000_000_000, scope: "global" },
      imageEvents: { ok: 3, fail: 0 },
    });
    client.imageGenProbe.record("guild-1", { ok: true, at: 1_700_000_100_000 });
    const snap = collectGuildHealth(client, { id: "guild-1", name: "Alpha Pub" });
    assert.equal(snap.health, HEALTH.healthy);
    assert.equal(snap.packs.health, HEALTH.healthy);
    assert.equal(snap.packs.packs[0].last_row_count, 12);
    assert.equal(snap.image.okCount, 3);
    assert.equal(snap.commands.loaded, 12);
    const text = formatHealthDescription(snap);
    assert.match(text, /🟢 healthy/);
    assert.match(text, /`plays`/);
    assert.match(text, /healthy/);
    assert.match(text, /12 rows/);
    assert.match(text, /last fetch ok/);
    assert.match(text, /3 ok \/ 0 fail/);
    assert.match(text, /last register 12 commands/);
    assert.doesNotMatch(text, /2PACX/);
    assert.doesNotMatch(text, /AIzaSy/);
    assert.doesNotMatch(text, /ThisIsASecretToken/);
  });

  it("turns red when a pack is broken or image-gen last attempt failed", () => {
    const brokenPacks = mockClient({
      packs: [
        {
          ...PLAYS,
          last_result: "http_error",
          last_error: `HTTP 404 from ${SECRET_URL}`,
          last_ok_at: null,
          last_attempt_at: 1_700_000_000_000,
        },
      ],
      slashNote: { ok: true, loaded: 12, registered: 12, at: 1_700_000_000_000, scope: "global" },
    });
    const packSnap = collectGuildHealth(brokenPacks, { id: "guild-1", name: "Alpha Pub" });
    assert.equal(packSnap.packs.health, HEALTH.broken);
    assert.equal(packSnap.health, HEALTH.broken);
    const packText = formatHealthDescription(packSnap);
    assert.match(packText, /🔴 unhealthy/);
    assert.match(packText, /HTTP error \(404\)/);
    assert.doesNotMatch(packText, /2PACX/);
    assert.doesNotMatch(packText, /ThisIsASecretToken/);

    const imageFail = mockClient({
      packs: [],
      slashNote: { ok: true, loaded: 12, registered: 12, at: 1_700_000_000_000, scope: "global" },
      imageEvents: { ok: 0, fail: 4 },
    });
    imageFail.imageGenProbe.record("guild-1", {
      ok: false,
      error: `request to ${SECRET_URL} failed with key ${SECRET_KEY}`,
      at: 1_700_000_200_000,
    });
    assert.doesNotMatch(imageFail.imageGenProbe.snapshot("guild-1").last_error, /AIzaSy|2PACX/);
    const imageSnap = collectGuildHealth(imageFail, { id: "guild-1", name: "Alpha Pub" });
    assert.equal(imageSnap.image.health, HEALTH.broken);
    assert.equal(imageSnap.health, HEALTH.broken);
    const imageText = formatHealthDescription(imageSnap);
    assert.match(imageText, /last generate failed/);
    assert.doesNotMatch(imageText, /2PACX/);
    assert.doesNotMatch(imageText, /AIzaSy/);
  });

  it("does not turn overall yellow just because no pack is configured and image-gen is idle", () => {
    const snap = collectGuildHealth(
      mockClient({
        packs: [],
        slashNote: { ok: true, loaded: 12, registered: 12, at: 1, scope: "global" },
      }),
      { id: "guild-1", name: "Empty Hall" }
    );
    assert.equal(snap.packs.health, HEALTH.missing);
    assert.equal(snap.image.health, HEALTH.never);
    assert.equal(snap.health, HEALTH.healthy);
  });

  it("keeps missing packs visually distinct from a failing pack", () => {
    const missing = formatHealthDescription(
      collectGuildHealth(
        mockClient({
          packs: [],
          slashNote: { ok: true, loaded: 12, registered: 12, at: 1, scope: "global" },
        }),
        { id: "guild-1", name: "Empty Hall" }
      )
    );
    const broken = formatHealthDescription(
      collectGuildHealth(
        mockClient({
          packs: [
            {
              ...PLAYS,
              last_result: "timeout",
              last_ok_at: null,
              last_attempt_at: 1,
            },
          ],
          slashNote: { ok: true, loaded: 12, registered: 12, at: 1, scope: "global" },
        }),
        { id: "guild-1", name: "Broken Hall" }
      )
    );
    assert.match(missing, /not using a CSV pack/);
    assert.doesNotMatch(missing, /broken/);
    assert.match(broken, /broken/);
    assert.doesNotMatch(broken, /not using a CSV pack/);
  });

  it("marks slash register failure and count mismatch", () => {
    const failed = collectGuildHealth(
      mockClient({
        slashNote: { ok: false, loaded: 12, scope: "global", error: "Missing Access", at: 1 },
      }),
      { id: "guild-1", name: "Alpha Pub" }
    );
    assert.equal(failed.commands.health, HEALTH.broken);
    assert.match(formatHealthDescription(failed), /last register failed/);

    const mismatch = collectGuildHealth(
      mockClient({
        slashNote: { ok: true, loaded: 12, registered: 10, scope: "global", at: 1 },
      }),
      { id: "guild-1", name: "Alpha Pub" }
    );
    assert.equal(mismatch.commands.health, HEALTH.stale);
  });

  it("formats compact all-server lines without pack URLs", () => {
    const client = mockClient({
      packs: [PLAYS],
      slashNote: { ok: true, loaded: 12, registered: 12, at: 1_700_000_000_000, scope: "global" },
    });
    const snap = collectGuildHealth(client, { id: "guild-1", name: "Alpha Pub" });
    const text = formatAllGuildsHealth([snap], snap);
    assert.match(text, /all servers/);
    assert.match(text, /Alpha Pub/);
    assert.match(text, /`guild-1`/);
    assert.match(text, /`plays`/);
    assert.doesNotMatch(text, /2PACX/);
  });

  it("gates the view to guild admins and bot admins", () => {
    const client = { config: { botOwnerId: "owner-1" } };
    assert.equal(
      canViewHealth(client, {
        user: { id: "rando" },
        memberPermissions: { has: () => false },
      }),
      false
    );
    assert.equal(
      canViewHealth(client, {
        user: { id: "rando" },
        memberPermissions: { has: () => true },
      }),
      true
    );
    assert.equal(
      canViewHealth(client, {
        user: { id: "owner-1" },
        memberPermissions: { has: () => false },
      }),
      true
    );
  });

  it("scrubs URLs and API-key-shaped tokens from health details", () => {
    const text = scrubHealthDetail(`request to ${SECRET_URL} failed with key ${SECRET_KEY}`);
    assert.match(text, /request to/);
    assert.doesNotMatch(text, /2PACX/);
    assert.doesNotMatch(text, /AIzaSy/);
  });

  it("formats cheap durations", () => {
    assert.equal(formatDuration(12_000), "12s");
    assert.equal(formatDuration(5 * 60 * 1000), "5m");
    assert.equal(formatDuration(3 * 60 * 60 * 1000 + 12 * 60 * 1000), "3h 12m");
  });
});

describe("image-gen probe hook", () => {
  it("records generateImageNew success and fail without storing the prompt", async () => {
    const client = {
      config: { geminiKey: "test" },
      logger: { log() {}, warn() {}, error() {} },
    };
    const ai = createGeminiAI(client);
    ai.AI2 = {
      models: {
        async generateContent() {
          return { candidates: [{ content: { parts: [{ inlineData: { data: "QQ==", mimeType: "image/png" } }] } }] };
        },
      },
    };
    ai.createAttachmentFromInlineData = () => ({ name: "ok.png" });
    const ok = await ai.generateImageNew("a secret prompt", { guildId: "guild-1" });
    assert.ok(ok);
    assert.equal(client.imageGenProbe.snapshot("guild-1").last_result, "ok");

    ai.AI2.models.generateContent = async () => {
      throw new Error(`boom at ${SECRET_URL} key ${SECRET_KEY}`);
    };
    const fail = await ai.generateImageNew("another secret prompt", { guildId: "guild-1" });
    assert.equal(fail, null);
    const last = client.imageGenProbe.snapshot("guild-1");
    assert.equal(last.last_result, "error");
    assert.match(last.last_error, /boom/);
    assert.doesNotMatch(last.last_error, /2PACX/);
    assert.doesNotMatch(last.last_error, /AIzaSy/);
    assert.doesNotMatch(JSON.stringify(last), /another secret prompt/);
  });
});
