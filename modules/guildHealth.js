/**
 * Per-server health snapshot for /status (FUR-77).
 *
 * Composes existing signals — do not treat this as a metrics platform:
 *   - context pack last fetch / health from contextPackFreshness (same fields
 *     as /context status; URLs are omitted here)
 *   - image-gen 7-day ok/fail counts from usagePulse
 *   - in-memory last image-gen result (timestamp + scrubbed error)
 *   - last slash-command registration note written at ready
 *   - process / Discord gateway uptime and ping
 */
import {
  HEALTH,
  HEALTH_COLOR,
  HEALTH_SHORT,
  canViewContextDashboard,
  collectGuildFreshness,
  formatDiscordTime,
  formatShortFreshness,
  worstHealth,
} from "./contextPackFreshness.js";
import { FEATURE_EVENTS } from "./usagePulse.js";
import { imageGenAvailable } from "./guildHelpFeatures.js";
import { isBotAdmin, splitDiscordMessages } from "./guildConfigOverview.js";
import { scrubErrorMessage } from "./contextPacks.js";

const OVERALL_LINE = {
  healthy: "🟢 healthy",
  stale: "🟡 needs attention",
  broken: "🔴 unhealthy",
  never: "⚪ not checked yet",
  missing: "⚪ nothing to check",
};

const IMAGE_LINE = {
  healthy: "✅ last generate succeeded",
  stale: "⚠️ recent failures (last generate may still have worked)",
  broken: "❌ last generate failed",
  never: "💤 no generate attempts this process",
  missing: "▫️ not enabled",
};

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const seconds = Math.floor(total / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 48) return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

function emptyImageProbe() {
  return {
    last_ok_at: null,
    last_error_at: null,
    last_attempt_at: null,
    last_result: null,
    last_error: null,
  };
}

function applyImageResult(entry, { ok, error, at }) {
  const next = { ...emptyImageProbe(), ...entry };
  next.last_attempt_at = at;
  if (ok) {
    next.last_ok_at = at;
    next.last_result = "ok";
    next.last_error = null;
  } else {
    next.last_error_at = at;
    next.last_result = "error";
    next.last_error = scrubErrorMessage(error || "image generation failed");
  }
  return next;
}

function createImageGenProbe({ now = () => Date.now() } = {}) {
  const byGuild = new Map();
  let processWide = emptyImageProbe();

  function record(guildId, event = {}) {
    const at = event.at ?? now();
    const ok = Boolean(event.ok);
    const error = event.error;
    processWide = applyImageResult(processWide, { ok, error, at });
    if (guildId) {
      const id = String(guildId);
      byGuild.set(id, applyImageResult(byGuild.get(id) || emptyImageProbe(), { ok, error, at }));
    }
  }

  function snapshot(guildId) {
    if (guildId && byGuild.has(String(guildId))) {
      return { ...byGuild.get(String(guildId)) };
    }
    return { ...processWide };
  }

  return { record, snapshot };
}

function rememberSlashRegistration(client, note = {}) {
  if (!client) return;
  const error = note.error == null ? null : scrubErrorMessage(note.error);
  client.slashRegistration = {
    at: note.at ?? Date.now(),
    ok: Boolean(note.ok),
    loaded: note.loaded ?? null,
    registered: note.registered ?? null,
    scope: note.scope || "unknown",
    error,
  };
}

function recordImageGenResult(client, event = {}) {
  if (!client) return;
  if (!client.imageGenProbe || typeof client.imageGenProbe.record !== "function") {
    client.imageGenProbe = createImageGenProbe();
  }
  try {
    client.imageGenProbe.record(event.guildId, event);
  } catch {
    // Health probe must never throw into image generation.
  }
}

function processHealth(client) {
  const ready =
    typeof client?.isReady === "function" ? Boolean(client.isReady()) : Boolean(client?.readyAt);
  const uptimeMs =
    typeof client?.uptime === "number" && Number.isFinite(client.uptime)
      ? client.uptime
      : Math.round(process.uptime() * 1000);
  const processUptimeMs = Math.round(process.uptime() * 1000);
  return {
    health: ready ? HEALTH.healthy : HEALTH.broken,
    ready,
    uptimeMs,
    processUptimeMs,
  };
}

function slashCommandHealth(client) {
  const loaded =
    typeof client?.slashcommands?.size === "number"
      ? client.slashcommands.size
      : Array.isArray(client?.slashcommands)
        ? client.slashcommands.length
        : null;
  const note = client?.slashRegistration || null;
  if (!note) {
    return {
      health: HEALTH.never,
      loaded,
      registered: null,
      at: null,
      ok: null,
      scope: null,
      error: null,
    };
  }
  let health = note.ok ? HEALTH.healthy : HEALTH.broken;
  if (note.ok && loaded != null && note.registered != null && Number(note.registered) !== Number(loaded)) {
    health = HEALTH.stale;
  }
  return {
    health,
    loaded,
    registered: note.registered ?? null,
    at: note.at ?? null,
    ok: note.ok,
    scope: note.scope || null,
    error: note.error || null,
  };
}

function discordHealth(client) {
  const ready =
    typeof client?.isReady === "function" ? Boolean(client.isReady()) : Boolean(client?.readyAt);
  const ping = client?.ws?.ping;
  const shards = client?.ws?.shards?.size ?? client?.shard?.count ?? null;
  let health = HEALTH.healthy;
  if (!ready) health = HEALTH.broken;
  else if (typeof ping === "number" && ping < 0) health = HEALTH.stale;
  const geminiKey = Boolean(client?.config?.geminiKey);
  const clientId = Boolean(client?.config?.clientId);
  return {
    health: !clientId && health === HEALTH.healthy ? HEALTH.stale : health,
    ready,
    ping: typeof ping === "number" ? ping : null,
    shards,
    geminiKey,
    clientId,
  };
}

function inferImageGenHealth({
  enabled = false,
  last_result = null,
  last_ok_at = null,
  last_attempt_at = null,
  okCount = 0,
  failCount = 0,
} = {}) {
  if (!enabled) return HEALTH.missing;
  const attempts = Number(okCount || 0) + Number(failCount || 0);
  if (!last_attempt_at && !last_ok_at && !last_result && attempts === 0) return HEALTH.never;
  if (last_result === "ok") return failCount > 0 ? HEALTH.stale : HEALTH.healthy;
  if (last_result && last_result !== "ok") return last_ok_at ? HEALTH.stale : HEALTH.broken;
  if (failCount > 0 && okCount === 0) return HEALTH.broken;
  if (failCount > 0) return HEALTH.stale;
  if (okCount > 0 || last_ok_at) return HEALTH.healthy;
  return HEALTH.never;
}

function imageGenHealth(client, guild, settings) {
  const enabled = imageGenAvailable(settings || {}, client?.config || {});
  const probe = client?.imageGenProbe || client?.geminiAI?.imageGenProbe;
  const last = probe?.snapshot?.(guild?.id) || emptyImageProbe();
  let okCount = 0;
  let failCount = 0;
  try {
    const events = client?.usagePulse?.guildReport?.(guild?.id)?.events || {};
    okCount = Number(events[FEATURE_EVENTS.IMAGE_GEN_SUCCESS] || 0);
    failCount = Number(events[FEATURE_EVENTS.IMAGE_GEN_FAIL] || 0);
  } catch {
    okCount = 0;
    failCount = 0;
  }
  const last_result = firstDefined(last.last_result, failCount > 0 && !last.last_ok_at ? "error" : null);
  const health = inferImageGenHealth({
    enabled,
    last_result,
    last_ok_at: last.last_ok_at,
    last_attempt_at: last.last_attempt_at,
    okCount,
    failCount,
  });
  return {
    health,
    enabled,
    last_result: last.last_result,
    last_ok_at: last.last_ok_at,
    last_error_at: last.last_error_at,
    last_attempt_at: last.last_attempt_at,
    last_error: last.last_error,
    okCount,
    failCount,
    windowDays: 7,
  };
}

function collectGuildHealth(client, guild) {
  const settings = guild ? client?.getSettings?.(guild) || {} : {};
  const packs = collectGuildFreshness(client, guild, client?.geminiAI?.contextPacks);
  const process = processHealth(client);
  const commands = slashCommandHealth(client);
  const image = imageGenHealth(client, guild, settings);
  const discord = discordHealth(client);
  // Missing / never-attempted image-gen is informational, not a fault.
  const imageForOverall =
    image.health === HEALTH.missing || image.health === HEALTH.never ? HEALTH.healthy : image.health;
  const health = worstHealth(process.health, commands.health, packs.health, imageForOverall, discord.health);
  return {
    guildId: guild?.id ? String(guild.id) : null,
    guildName: guild?.name || "(unknown guild)",
    health,
    process,
    commands,
    packs,
    image,
    discord,
  };
}

function collectAllGuildHealth(client, guilds) {
  const list = [...(guilds || [])].sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""))
  );
  return list.map((guild) => collectGuildHealth(client, guild));
}

function formatProcessLine(row) {
  const mark = HEALTH_SHORT[row.health] || row.health;
  const up = formatDuration(row.uptimeMs);
  const proc = formatDuration(row.processUptimeMs);
  if (!row.ready) return `${mark} — Discord gateway not ready · process up ${proc}`;
  return `${mark} — Discord up ${up} · process up ${proc}`;
}

function formatCommandsLine(row) {
  const mark = HEALTH_SHORT[row.health] || row.health;
  const loaded = row.loaded == null ? "unknown" : String(row.loaded);
  if (row.ok == null) {
    return `${mark} — ${loaded} loaded this process, no register note yet`;
  }
  const registered = row.registered == null ? "unknown" : String(row.registered);
  const scope = row.scope ? ` (${row.scope})` : "";
  const when = formatDiscordTime(row.at);
  if (!row.ok) {
    const err = row.error ? ` — ${row.error}` : "";
    return `${mark} — last register failed ${when}${scope}${err}`;
  }
  return `${mark} — ${loaded} loaded, last register ${registered} commands ${when}${scope}`;
}

function formatPacksLine(snapshot) {
  if (snapshot.missing || !snapshot.packs?.length) {
    return `${HEALTH_SHORT.missing} — chat is not using a CSV pack`;
  }
  return snapshot.packs
    .map((pack) => {
      const lastOk = formatDiscordTime(pack.last_ok_at);
      return `\`${pack.name}\` — ${formatShortFreshness(pack)} · last ok ${lastOk}`;
    })
    .join("\n");
}

function formatImageLine(row) {
  const mark = IMAGE_LINE[row.health] || HEALTH_SHORT[row.health] || row.health;
  if (!row.enabled) return mark;
  const rate = `${row.windowDays}d ${row.okCount} ok / ${row.failCount} fail`;
  const last = row.last_result
    ? `${row.last_result} · ${formatDiscordTime(row.last_attempt_at)}`
    : "no attempt this process";
  const lines = [`${mark} — last ${last}`, rate];
  if (row.last_error && row.last_result && row.last_result !== "ok") {
    lines.push(`Error: ${scrubErrorMessage(row.last_error)}`);
  }
  return lines.join("\n");
}

function formatDiscordLine(row) {
  const mark = HEALTH_SHORT[row.health] || row.health;
  const ping = typeof row.ping === "number" && row.ping >= 0 ? `${Math.round(row.ping)}ms` : "n/a";
  const shard =
    typeof row.shards === "number" && row.shards > 0
      ? ` · ${row.shards} shard${row.shards === 1 ? "" : "s"}`
      : "";
  const bits = [`${mark} — gateway ${row.ready ? "ready" : "down"} · ping ${ping}${shard}`];
  if (!row.clientId) bits.push("⚠️ clientId missing (slash register may fail)");
  if (!row.geminiKey) bits.push("⚠️ Gemini key missing (chat / image-gen will fail)");
  return bits.join("\n");
}

function formatHealthDescription(snapshot) {
  const overall = OVERALL_LINE[snapshot.health] || snapshot.health;
  return [
    `**Server health — ${snapshot.guildName}**`,
    "Admin-only. Ephemeral. No secrets (pack URLs are on `/context status`).",
    `Overall: ${overall}`,
    "",
    "**Process**",
    formatProcessLine(snapshot.process),
    "",
    "**Slash commands**",
    formatCommandsLine(snapshot.commands),
    "",
    "**Context pack**",
    formatPacksLine(snapshot.packs),
    "",
    "**Image generation**",
    formatImageLine(snapshot.image),
    "",
    "**Discord / config**",
    formatDiscordLine(snapshot.discord),
  ].join("\n");
}

function formatAllGuildsHealth(snapshots, shared) {
  const list = Array.isArray(snapshots) ? snapshots : [];
  const header = [
    `**Bot health — all servers** (${list.length} guild${list.length === 1 ? "" : "s"})`,
    "Bot owner / configured admin IDs only. No secrets. Pack URLs stay on `/context status`.",
    "",
    "**Process**",
    formatProcessLine(shared.process),
    "",
    "**Slash commands**",
    formatCommandsLine(shared.commands),
    "",
    "**Discord / config**",
    formatDiscordLine(shared.discord),
    "",
  ];
  if (!list.length) return header.join("\n") + "No joined guilds.";
  const body = list
    .map((snap) => {
      const overall = OVERALL_LINE[snap.health] || snap.health;
      return [
        `**${snap.guildName}** — \`${snap.guildId}\` · ${overall}`,
        `Packs: ${formatPacksLine(snap.packs).replace(/\n/g, " · ")}`,
        `Image-gen: ${formatImageLine(snap.image).split("\n")[0]}`,
      ].join("\n");
    })
    .join("\n\n");
  return header.join("\n") + body;
}

function healthEmbedColor(health) {
  return HEALTH_COLOR[health] || HEALTH_COLOR.missing;
}

export {
  OVERALL_LINE,
  IMAGE_LINE,
  canViewContextDashboard as canViewHealth,
  isBotAdmin,
  createImageGenProbe,
  recordImageGenResult,
  rememberSlashRegistration,
  inferImageGenHealth,
  collectGuildHealth,
  collectAllGuildHealth,
  formatDuration,
  formatProcessLine,
  formatCommandsLine,
  formatPacksLine,
  formatImageLine,
  formatDiscordLine,
  formatHealthDescription,
  formatAllGuildsHealth,
  healthEmbedColor,
  splitDiscordMessages,
};
