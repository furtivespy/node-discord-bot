import { PermissionsBitField } from "discord.js";
import { isBotAdmin, splitDiscordMessages } from "./guildConfigOverview.js";
import { CACHE_TTL_MS, listGuildPacks, redactUrl } from "./contextPacks.js";

const HEALTH = {
  missing: "missing",
  never: "never",
  healthy: "healthy",
  stale: "stale",
  broken: "broken",
};

const HEALTH_RANK = {
  broken: 4,
  stale: 3,
  never: 2,
  healthy: 1,
  missing: 0,
};

const HEALTH_COLOR = {
  broken: 0xe74c3c,
  stale: 0xf1c40f,
  never: 0x95a5a6,
  healthy: 0x2ecc71,
  missing: 0x95a5a6,
};

const HEALTH_LINE = {
  healthy: "✅ healthy — last fetch succeeded",
  stale: "⚠️ stale — configured, but the latest fetch failed (chat may still use old rows)",
  broken: "❌ broken — configured, but Bender has never successfully fetched it",
  never: "💤 never fetched — configured, but nothing has been downloaded yet",
  missing: "▫️ not configured",
};

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function canViewContextDashboard(client, interaction) {
  if (isBotAdmin(client, interaction?.user?.id)) return true;
  try {
    return Boolean(interaction?.memberPermissions?.has(PermissionsBitField.Flags.Administrator));
  } catch {
    return false;
  }
}

function formatFetchResult(result, error) {
  if (!result) return "never";
  if (result === "ok") return "ok";
  if (result === "http_error") {
    const status = /\bHTTP\s+(\d{3})\b/i.exec(String(error || ""));
    return status ? `HTTP error (${status[1]})` : "HTTP error";
  }
  if (result === "parse_error") return "parse error";
  if (result === "timeout") return "timeout";
  const detail = String(error || "").trim();
  return detail ? `error (${detail})` : "error";
}

function formatDiscordTime(ms) {
  if (ms == null || ms === "") return "never";
  const unix = Math.floor(Number(ms) / 1000);
  if (!Number.isFinite(unix) || unix <= 0) return "never";
  return `<t:${unix}:f> (<t:${unix}:R>)`;
}

function formatBytes(n) {
  const bytes = Number(n);
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function inferPackHealth({
  configured = true,
  last_result = null,
  last_ok_at = null,
  last_attempt_at = null,
} = {}) {
  if (!configured) return HEALTH.missing;
  if (!last_attempt_at && !last_ok_at && !last_result) return HEALTH.never;
  // Persisted last_result "ok" is healthy even after restart (in-memory cache is empty).
  // Cache TTL / inCache is shown on the expires line, not the headline.
  if (last_result === "ok") return HEALTH.healthy;
  if (last_result && last_result !== "ok") {
    return last_ok_at ? HEALTH.stale : HEALTH.broken;
  }
  if (last_ok_at) return HEALTH.stale;
  return HEALTH.never;
}

function worstHealth(...healths) {
  return healths.reduce(
    (worst, health) => (HEALTH_RANK[health] > HEALTH_RANK[worst] ? health : worst),
    HEALTH.missing
  );
}

function buildPackFreshness(pack, liveStatus = {}) {
  const ttlMs = liveStatus.ttlMs ?? CACHE_TTL_MS;
  const last_ok_at = firstDefined(liveStatus.last_ok_at, pack?.last_ok_at);
  const last_attempt_at = firstDefined(liveStatus.last_attempt_at, pack?.last_attempt_at);
  const last_result = firstDefined(liveStatus.last_result, pack?.last_result);
  const last_error = firstDefined(liveStatus.last_error, pack?.last_error);
  const last_row_count = firstDefined(liveStatus.last_row_count, pack?.last_row_count);
  const last_bytes = firstDefined(liveStatus.last_bytes, pack?.last_bytes);
  const inCache = Boolean(liveStatus.inCache);
  const cacheStale = inCache ? Boolean(liveStatus.cacheStale) : true;
  const health = inferPackHealth({
    configured: true,
    last_result,
    last_ok_at,
    last_attempt_at,
    inCache,
    cacheStale,
  });

  return {
    name: pack?.name || "(unnamed)",
    kind: pack?.kind || "unknown",
    configured: true,
    redactedUrl: redactUrl(pack?.url),
    health,
    last_ok_at,
    last_attempt_at,
    last_result,
    last_error: last_result === "ok" ? null : last_error,
    last_row_count,
    last_bytes,
    inCache,
    cacheStale,
    expiresAt: liveStatus.expiresAt ?? null,
    ttlMs,
  };
}

function buildGuildFreshness({ guildId, guildName, packs, service } = {}) {
  const list = Array.isArray(packs) ? packs : [];
  const rows = list.map((pack) =>
    buildPackFreshness(pack, service?.getUrlStatus?.(pack.url) || { ttlMs: service?.ttlMs || CACHE_TTL_MS })
  );
  const health =
    rows.length === 0
      ? HEALTH.missing
      : rows.reduce((worst, row) => worstHealth(worst, row.health), HEALTH.healthy);
  return {
    guildId: guildId ? String(guildId) : null,
    guildName: guildName || "(unknown guild)",
    health,
    missing: rows.length === 0,
    packs: rows,
  };
}

function collectGuildFreshness(client, guild, service) {
  const packs = listGuildPacks(client.getSettings(guild));
  return buildGuildFreshness({
    guildId: guild?.id,
    guildName: guild?.name,
    packs,
    service,
  });
}

function formatPackFreshness(row) {
  const expires =
    row.inCache && !row.cacheStale && row.expiresAt
      ? formatDiscordTime(row.expiresAt)
      : row.inCache && row.cacheStale
        ? "expired (still in memory)"
        : "not in memory";
  const rows = row.last_row_count == null ? "unknown" : String(row.last_row_count);
  const size = row.last_bytes == null ? "" : ` · ${formatBytes(row.last_bytes)}`;
  const lines = [
    `**\`${row.name}\`** (${row.kind})`,
    "Configured: yes",
    `Health: ${HEALTH_LINE[row.health]}`,
    `Last success: ${formatDiscordTime(row.last_ok_at)}`,
    `Last fetch: ${formatFetchResult(row.last_result, row.last_error)} · ${formatDiscordTime(row.last_attempt_at)}`,
  ];
  if (row.last_error && row.last_result && row.last_result !== "ok") {
    lines.push(`Error: ${row.last_error}`);
  }
  lines.push(`Cached rows: ${rows}${size}`);
  lines.push(`Cache TTL: ${Math.round(row.ttlMs / 60000)} min · expires ${expires}`);
  lines.push(`URL: ${row.redactedUrl}`);
  return lines.join("\n");
}

function formatFreshnessDashboard(snapshot) {
  const header = [
    `**Context pack freshness — ${snapshot.guildName}**`,
    "Admin-only. Full published URLs are never shown.",
    "",
  ];
  if (snapshot.missing) {
    return (
      header.join("\n") +
      "▫️ **No context packs configured** on this server. Chat is not using a CSV pack. This is distinct from a configured pack that failed to fetch.\n\nAdd one with `/context add`."
    );
  }
  return (
    header.join("\n") +
    snapshot.packs.map(formatPackFreshness).join("\n\n") +
    "\n\nRefresh now re-downloads immediately (does not wait for TTL)."
  );
}

function formatAllGuildsFreshness(snapshots) {
  const list = Array.isArray(snapshots) ? snapshots : [];
  const header = [
    `**Context pack freshness — all servers** (${list.length} guild${list.length === 1 ? "" : "s"})`,
    "Bot owner / configured admin IDs only. Full URLs redacted.",
    "",
  ];
  if (!list.length) return header.join("\n") + "No joined guilds.";
  return (
    header.join("\n") +
    list
      .map((snap) => {
        if (snap.missing) {
          return `**${snap.guildName}** — \`${snap.guildId}\`\n▫️ No context packs configured`;
        }
        const summary = snap.packs
          .map(
            (row) =>
              `• \`${row.name}\`: ${row.health} · last fetch ${formatFetchResult(row.last_result, row.last_error)} · rows ${row.last_row_count ?? "unknown"} · last success ${formatDiscordTime(row.last_ok_at)}`
          )
          .join("\n");
        return `**${snap.guildName}** — \`${snap.guildId}\`\n${summary}`;
      })
      .join("\n\n")
  );
}

function freshnessEmbedColor(health) {
  return HEALTH_COLOR[health] || HEALTH_COLOR.missing;
}

function refreshCustomId(packName = "all") {
  return `context:refresh:${packName}`;
}

function parseRefreshCustomId(customId) {
  const match = /^context:refresh:([a-z][a-z0-9-]*|all)$/.exec(String(customId || ""));
  return match ? match[1] : null;
}

export {
  HEALTH,
  HEALTH_COLOR,
  HEALTH_LINE,
  canViewContextDashboard,
  formatFetchResult,
  formatDiscordTime,
  formatBytes,
  inferPackHealth,
  worstHealth,
  buildPackFreshness,
  buildGuildFreshness,
  collectGuildFreshness,
  formatPackFreshness,
  formatFreshnessDashboard,
  formatAllGuildsFreshness,
  freshnessEmbedColor,
  refreshCustomId,
  parseRefreshCustomId,
  splitDiscordMessages,
};
