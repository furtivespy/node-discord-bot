import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HEALTH,
  canViewContextDashboard,
  formatFetchResult,
  formatDiscordTime,
  formatBytes,
  inferPackHealth,
  buildPackFreshness,
  buildGuildFreshness,
  formatFreshnessDashboard,
  formatAllGuildsFreshness,
  parseRefreshCustomId,
  refreshCustomId,
} from "../modules/contextPackFreshness.js";

const SECRET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vThisIsASecretToken/pub?output=csv";

const PLAYS = { name: "plays", kind: "plays", url: SECRET_URL };

describe("context pack freshness dashboard", () => {
  it("maps last fetch results to the ticket labels", () => {
    assert.equal(formatFetchResult("ok"), "ok");
    assert.equal(formatFetchResult("http_error", "HTTP 404"), "HTTP error (404)");
    assert.equal(formatFetchResult("parse_error"), "parse error");
    assert.equal(formatFetchResult("timeout"), "timeout");
    assert.equal(formatFetchResult(null), "never");
  });

  it("distinguishes missing, never fetched, broken, stale, and healthy", () => {
    assert.equal(inferPackHealth({ configured: false }), HEALTH.missing);
    assert.equal(inferPackHealth({}), HEALTH.never);
    assert.equal(
      inferPackHealth({ last_result: "http_error", last_attempt_at: 1 }),
      HEALTH.broken
    );
    assert.equal(
      inferPackHealth({ last_result: "parse_error", last_ok_at: 1, last_attempt_at: 2 }),
      HEALTH.stale
    );
    assert.equal(
      inferPackHealth({ last_result: "ok", last_ok_at: 1, inCache: true, cacheStale: false }),
      HEALTH.healthy
    );
    assert.equal(
      inferPackHealth({ last_result: "ok", last_ok_at: 1, inCache: false, cacheStale: true }),
      HEALTH.healthy
    );
  });

  it("does not label persisted last_result ok as stale after a cache miss", () => {
    const row = buildPackFreshness(
      {
        ...PLAYS,
        last_result: "ok",
        last_ok_at: 1_700_000_000_000,
        last_attempt_at: 1_700_000_000_000,
        last_row_count: 12,
      },
      { ttlMs: 10 * 60 * 1000, inCache: false, cacheStale: true }
    );
    assert.equal(row.health, HEALTH.healthy);
    const text = formatPackSectionForAssert(row);
    assert.match(text, /healthy/);
    assert.match(text, /Last fetch: ok/);
    assert.doesNotMatch(text, /latest fetch failed/);
    assert.doesNotMatch(text, /stale/);
  });

  it("never prints the secret URL and keeps missing vs failing visually distinct", () => {
    const missing = formatFreshnessDashboard(
      buildGuildFreshness({ guildName: "Alpha Pub", packs: [] })
    );
    assert.match(missing, /No context packs configured/);
    assert.match(missing, /distinct from a configured pack that failed/);
    assert.doesNotMatch(missing, /2PACX/);

    const broken = formatFreshnessDashboard(
      buildGuildFreshness({
        guildName: "Alpha Pub",
        packs: [
          {
            ...PLAYS,
            last_result: "http_error",
            last_error: "HTTP 404",
            last_attempt_at: 1_700_000_000_000,
          },
        ],
      })
    );
    assert.match(broken, /broken/);
    assert.match(broken, /Configured: yes/);
    assert.match(broken, /HTTP error \(404\)/);
    assert.match(broken, /https:\/\/docs\.google\.com\/…/);
    assert.doesNotMatch(broken, /2PACX/);
    assert.doesNotMatch(broken, /ThisIsASecretToken/);
    assert.notEqual(missing.includes("No context packs configured"), broken.includes("No context packs configured"));
  });

  it("shows row count, TTL, and last success on a healthy pack", () => {
    const row = buildPackFreshness(PLAYS, {
      last_ok_at: 1_700_000_000_000,
      last_attempt_at: 1_700_000_000_000,
      last_result: "ok",
      last_row_count: 128,
      last_bytes: 4096,
      inCache: true,
      cacheStale: false,
      expiresAt: 1_700_000_600_000,
      ttlMs: 10 * 60 * 1000,
    });
    assert.equal(row.health, HEALTH.healthy);
    assert.equal(row.configured, true);
    const text = formatPackSectionForAssert(row);
    assert.match(text, /128/);
    assert.match(text, /10 min/);
    assert.match(text, /<t:1700000000:/);
    assert.doesNotMatch(text, /2PACX/);
  });

  it("redacts secrets in the all-guilds owner view", () => {
    const text = formatAllGuildsFreshness([
      buildGuildFreshness({
        guildId: "111",
        guildName: "Alpha",
        packs: [{ ...PLAYS, last_result: "timeout", last_error: `request to ${SECRET_URL} failed` }],
      }),
      buildGuildFreshness({ guildId: "222", guildName: "Empty Hall", packs: [] }),
    ]);
    assert.match(text, /Alpha/);
    assert.match(text, /Empty Hall/);
    assert.match(text, /No context packs configured/);
    assert.match(text, /timeout/);
    assert.doesNotMatch(text, /2PACX/);
    assert.doesNotMatch(text, /ThisIsASecretToken/);
  });

  it("formats Discord timestamps and byte sizes", () => {
    assert.equal(formatDiscordTime(null), "never");
    assert.equal(formatDiscordTime(1_700_000_000_000), "<t:1700000000:f> (<t:1700000000:R>)");
    assert.equal(formatBytes(800), "800 B");
    assert.equal(formatBytes(2048), "2.0 KB");
  });

  it("gates the dashboard to guild admins and bot admins", () => {
    const client = { config: { botOwnerId: "owner-1" } };
    assert.equal(
      canViewContextDashboard(client, {
        user: { id: "rando" },
        memberPermissions: { has: () => false },
      }),
      false
    );
    assert.equal(
      canViewContextDashboard(client, {
        user: { id: "rando" },
        memberPermissions: { has: () => true },
      }),
      true
    );
    assert.equal(
      canViewContextDashboard(client, {
        user: { id: "owner-1" },
        memberPermissions: { has: () => false },
      }),
      true
    );
  });

  it("parses refresh button ids without embedding URLs", () => {
    assert.equal(refreshCustomId("plays"), "context:refresh:plays");
    assert.equal(parseRefreshCustomId("context:refresh:plays"), "plays");
    assert.equal(parseRefreshCustomId("context:refresh:all"), "all");
    assert.equal(parseRefreshCustomId("help:category"), null);
  });
});

function formatPackSectionForAssert(row) {
  return formatFreshnessDashboard({
    guildName: "Test",
    health: row.health,
    missing: false,
    packs: [row],
  });
}
