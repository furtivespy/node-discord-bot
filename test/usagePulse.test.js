import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FEATURE_EVENTS,
  createMemoryStore,
  createUsagePulse,
  formatAllGuildsUsageText,
  formatGuildUsageText,
  noteSlashUse,
} from "../modules/usagePulse.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-09-18T15:00:00.000Z");

function pulseAt(ms, extra = {}) {
  return createUsagePulse({ now: () => ms, flushMs: 0, ...extra });
}

describe("usagePulse counters", () => {
  it("increments slash names in memory without touching the store until flush", () => {
    const store = createMemoryStore();
    const pulse = pulseAt(T0, { store });
    pulse.recordSlash("guild-a", "wiki");
    pulse.recordSlash("guild-a", "wiki");
    pulse.recordSlash("guild-a", "ping");
    assert.equal(store.get("daily"), undefined);
    const report = pulse.guildReport("guild-a");
    assert.deepEqual(report.topCommands, [
      { name: "wiki", count: 2 },
      { name: "ping", count: 1 },
    ]);
    assert.equal(report.slashTotal, 3);
    assert.equal(report.from, "2026-09-12");
    assert.equal(report.to, "2026-09-18");
  });

  it("survives restart after flush using the same store", () => {
    const store = createMemoryStore();
    const first = pulseAt(T0, { store });
    first.recordSlash("guild-a", "wiki");
    first.recordEvent("guild-a", FEATURE_EVENTS.CONTEXT_PACK_INJECT);
    first.flush();

    const second = pulseAt(T0, { store });
    const report = second.guildReport("guild-a");
    assert.deepEqual(report.topCommands, [{ name: "wiki", count: 1 }]);
    assert.equal(report.events.context_pack_inject, 1);
  });

  it("keeps a 7-day window and drops older UTC days", () => {
    const store = createMemoryStore();
    const early = pulseAt(T0 - 8 * DAY_MS, { store });
    early.recordSlash("guild-a", "oldcmd");
    early.flush();

    const later = pulseAt(T0, { store });
    later.recordSlash("guild-a", "wiki");
    later.flush();

    const report = later.guildReport("guild-a");
    assert.deepEqual(report.topCommands, [{ name: "wiki", count: 1 }]);
    assert.equal(report.topCommands.some((row) => row.name === "oldcmd"), false);
  });

  it("ignores DMs, junk command names, unknown events, and never stores user ids", () => {
    const pulse = pulseAt(T0);
    noteSlashUse(pulse, { commandName: "wiki" });
    noteSlashUse(pulse, { guildId: "guild-a", commandName: "not a command!!" });
    noteSlashUse(pulse, { guildId: "guild-a", commandName: "wiki" });
    pulse.recordEvent("guild-a", "not_a_real_event");
    pulse.recordEvent("guild-a", FEATURE_EVENTS.IMAGE_GEN_FAIL);

    const report = pulse.guildReport("guild-a");
    assert.deepEqual(report.topCommands, [{ name: "wiki", count: 1 }]);
    assert.equal(report.events.image_gen_fail, 1);
    assert.equal(report.events.image_gen_success, 0);

    const text = formatGuildUsageText(report, { guildName: "Alpha Pub" });
    assert.equal(text.includes("guild-a"), false);
    assert.equal(/\b\d{17,19}\b/.test(text), false);
    assert.equal(/<@/.test(text), false);
    assert.match(text, /\/wiki/);
    assert.match(text, /image-gen fail: 1/);
    assert.match(text, /no users or message content/i);
  });

  it("hot-path noteSlashUse never throws even if the pulse is broken", () => {
    assert.doesNotThrow(() => noteSlashUse(null, { guildId: "g", commandName: "wiki" }));
    assert.doesNotThrow(() =>
      noteSlashUse(
        {
          recordSlash() {
            throw new Error("boom");
          },
        },
        { guildId: "g", commandName: "wiki" }
      )
    );
  });

  it("rolls up across guilds with names only", () => {
    const pulse = pulseAt(T0);
    pulse.recordSlash("111111111111111111", "wiki");
    pulse.recordSlash("111111111111111111", "wiki");
    pulse.recordSlash("222222222222222222", "ping");
    pulse.recordEvent("111111111111111111", FEATURE_EVENTS.IMAGE_GEN_SUCCESS);

    const rollup = pulse.allGuildsReport({
      guildNameById: {
        "111111111111111111": "Alpha Pub",
        "222222222222222222": "Beta Den",
      },
    });
    assert.equal(rollup.guilds[0].guildName, "Alpha Pub");
    assert.equal(rollup.guilds[0].slashTotal, 2);
    assert.equal(rollup.guilds[1].guildName, "Beta Den");

    const text = formatAllGuildsUsageText(rollup.guilds, rollup);
    assert.equal(text.includes("111111111111111111"), false);
    assert.equal(text.includes("222222222222222222"), false);
    assert.match(text, /Alpha Pub/);
    assert.match(text, /Beta Den/);
    assert.match(text, /image-gen 1 ok/);
    assert.match(text, /No user ids/);
  });
});
