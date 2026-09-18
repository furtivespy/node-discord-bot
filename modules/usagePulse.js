/**
 * Privacy-safe usage pulse (FUR-79).
 *
 * Counts slash-command names and a few named feature events per guild, by UTC
 * day. Hot path is an in-memory Map increment. A periodic flush writes daily
 * rollups to Enmap (or any get/set store) so a 7-day window survives restart.
 *
 * Never stores user ids, member ids, message content, or prompts.
 */

const STORE_KEY = "daily";
const WINDOW_DAYS = 7;
const RETAIN_DAYS = 8;
const FLUSH_MS = 30_000;
const TOP_N = 5;
const SLASH_NAME_RE = /^[\w-]{1,32}$/;

const FEATURE_EVENTS = {
  CONTEXT_PACK_INJECT: "context_pack_inject",
  IMAGE_GEN_SUCCESS: "image_gen_success",
  IMAGE_GEN_FAIL: "image_gen_fail",
};

const FEATURE_EVENT_SET = new Set(Object.values(FEATURE_EVENTS));

const FEATURE_LABELS = {
  [FEATURE_EVENTS.CONTEXT_PACK_INJECT]: "context-pack inject",
  [FEATURE_EVENTS.IMAGE_GEN_SUCCESS]: "image-gen success",
  [FEATURE_EVENTS.IMAGE_GEN_FAIL]: "image-gen fail",
};

function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function dayKeysForWindow(now = Date.now(), days = WINDOW_DAYS) {
  const start = new Date(now);
  const keys = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - i));
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function sanitizeSlashName(name) {
  if (typeof name !== "string") return null;
  const n = name.trim().toLowerCase();
  return SLASH_NAME_RE.test(n) ? n : null;
}

function cloneDaily(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  try {
    return structuredClone(data);
  } catch {
    return JSON.parse(JSON.stringify(data));
  }
}

function emptyDay() {
  return { slash: {}, event: {} };
}

function prune(data, now = Date.now()) {
  const keep = new Set(dayKeysForWindow(now, RETAIN_DAYS));
  const out = {};
  for (const [guildId, days] of Object.entries(data || {})) {
    if (!guildId || typeof days !== "object" || !days) continue;
    const kept = {};
    for (const [day, buckets] of Object.entries(days)) {
      if (!keep.has(day)) continue;
      kept[day] = {
        slash: { ...(buckets?.slash || {}) },
        event: { ...(buckets?.event || {}) },
      };
    }
    if (Object.keys(kept).length) out[guildId] = kept;
  }
  return out;
}

function mergePending(data, pending, now = Date.now()) {
  const next = cloneDaily(data);
  for (const [key, count] of pending) {
    if (!count) continue;
    const [guildId, day, kind, name] = key.split("\t");
    if (!guildId || !day || !kind || !name) continue;
    if (!next[guildId]) next[guildId] = {};
    if (!next[guildId][day]) next[guildId][day] = emptyDay();
    if (!next[guildId][day][kind]) next[guildId][day][kind] = {};
    next[guildId][day][kind][name] = (next[guildId][day][kind][name] || 0) + count;
  }
  return prune(next, now);
}

function sumMaps(days, windowKeys, kind) {
  const totals = {};
  for (const day of windowKeys) {
    const bucket = days?.[day]?.[kind];
    if (!bucket) continue;
    for (const [name, count] of Object.entries(bucket)) {
      if (!count) continue;
      totals[name] = (totals[name] || 0) + count;
    }
  }
  return totals;
}

function topEntries(totals, limit = TOP_N) {
  return Object.entries(totals)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function featureCounts(totals) {
  const counts = {};
  for (const name of FEATURE_EVENT_SET) {
    counts[name] = totals[name] || 0;
  }
  return counts;
}

function buildGuildStats(days, { now = Date.now(), days: windowDays = WINDOW_DAYS, top = TOP_N } = {}) {
  const windowKeys = dayKeysForWindow(now, windowDays);
  const slashTotals = sumMaps(days, windowKeys, "slash");
  const eventTotals = sumMaps(days, windowKeys, "event");
  const topCommands = topEntries(slashTotals, top);
  const slashTotal = Object.values(slashTotals).reduce((sum, n) => sum + n, 0);
  return {
    windowDays,
    from: windowKeys[windowKeys.length - 1],
    to: windowKeys[0],
    topCommands,
    slashTotal,
    events: featureCounts(eventTotals),
  };
}

function formatCommandLines(topCommands) {
  if (!topCommands.length) {
    return "No slash commands recorded yet. Rankings fill in as people use commands.";
  }
  return topCommands
    .map((row, i) => `${i + 1}. \`/${row.name}\` — ${row.count}`)
    .join("\n");
}

function formatEventLines(events) {
  return [
    FEATURE_EVENTS.CONTEXT_PACK_INJECT,
    FEATURE_EVENTS.IMAGE_GEN_SUCCESS,
    FEATURE_EVENTS.IMAGE_GEN_FAIL,
  ]
    .map((name) => `${FEATURE_LABELS[name]}: ${events[name] || 0}`)
    .join("\n");
}

function formatGuildUsageText(stats, { guildName, heading } = {}) {
  const title = heading || `**Usage pulse — last ${stats.windowDays} days**`;
  const who = guildName ? `${guildName}\n` : "";
  return [
    title,
    who + `UTC ${stats.from} – ${stats.to}. Guild-level counts only; no users or message content.`,
    "",
    "**Top slash commands**",
    formatCommandLines(stats.topCommands),
    "",
    "**Feature signals**",
    formatEventLines(stats.events),
  ].join("\n");
}

function formatAllGuildsUsageText(rows, { windowDays = WINDOW_DAYS, from, to } = {}) {
  const header = [
    `**Usage pulse — last ${windowDays} days (all servers)**`,
    `UTC ${from} – ${to}. Guild names only. No user ids, member ids, or message content.`,
    "",
  ];
  if (!rows.length) {
    return header.join("\n") + "\nNo usage recorded yet across joined servers.";
  }
  const body = rows
    .map((row) => {
      const commands = formatCommandLines(row.topCommands);
      const events = [
        `context-pack inject ${row.events.context_pack_inject || 0}`,
        `image-gen ${row.events.image_gen_success || 0} ok / ${row.events.image_gen_fail || 0} fail`,
      ].join(" · ");
      const uses = row.slashTotal === 1 ? "slash use" : "slash uses";
      return `**${row.guildName}** — ${row.slashTotal} ${uses}\n${commands}\n${events}`;
    })
    .join("\n\n");
  return `${header.join("\n")}\n${body}`;
}

function guildLabel(guildNameById, guildId) {
  const name = guildNameById?.[guildId];
  if (typeof name === "string" && name.trim()) return name.trim();
  return "unknown server";
}

function createMemoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get(key) {
      return data.get(key);
    },
    set(key, value) {
      data.set(key, value);
    },
  };
}

function createUsagePulse({
  store = createMemoryStore(),
  now = () => Date.now(),
  flushMs = FLUSH_MS,
  logger = null,
} = {}) {
  const pending = new Map();
  let timer = null;

  function pendingKey(guildId, day, kind, name) {
    return `${guildId}\t${day}\t${kind}\t${name}`;
  }

  function bump(guildId, kind, name) {
    if (typeof guildId !== "string" || !guildId) return;
    const day = utcDay(now());
    const key = pendingKey(guildId, day, kind, name);
    pending.set(key, (pending.get(key) || 0) + 1);
  }

  function recordSlash(guildId, commandName) {
    const name = sanitizeSlashName(commandName);
    if (!name) return;
    bump(guildId, "slash", name);
  }

  function recordEvent(guildId, eventName) {
    if (!FEATURE_EVENT_SET.has(eventName)) return;
    bump(guildId, "event", eventName);
  }

  function load() {
    if (!store || typeof store.get !== "function") return {};
    try {
      return cloneDaily(store.get(STORE_KEY));
    } catch (error) {
      logger?.log?.(error, "warn");
      return {};
    }
  }

  function snapshot() {
    return mergePending(load(), pending, now());
  }

  function flush() {
    if (!store || typeof store.set !== "function") {
      pending.clear();
      return;
    }
    try {
      const merged = snapshot();
      store.set(STORE_KEY, merged);
      pending.clear();
    } catch (error) {
      logger?.log?.(error, "warn");
    }
  }

  function guildReport(guildId, options = {}) {
    const data = snapshot();
    return buildGuildStats(data[guildId] || {}, { now: now(), ...options });
  }

  function allGuildsReport({ guildNameById = {}, extraGuildIds = [], ...options } = {}) {
    const data = snapshot();
    const ids = new Set([...Object.keys(data), ...Object.keys(guildNameById || {}), ...extraGuildIds]);
    const rows = [];
    for (const guildId of ids) {
      const stats = buildGuildStats(data[guildId] || {}, { now: now(), ...options });
      rows.push({
        guildName: guildLabel(guildNameById, guildId),
        slashTotal: stats.slashTotal,
        topCommands: stats.topCommands,
        events: stats.events,
        from: stats.from,
        to: stats.to,
        windowDays: stats.windowDays,
      });
    }
    rows.sort((a, b) => b.slashTotal - a.slashTotal || a.guildName.localeCompare(b.guildName));
    const windowDays = options.days || WINDOW_DAYS;
    const windowKeys = dayKeysForWindow(now(), windowDays);
    return {
      windowDays,
      from: windowKeys[windowKeys.length - 1],
      to: windowKeys[0],
      guilds: rows,
    };
  }

  function start() {
    if (timer || !flushMs) return;
    timer = setInterval(() => {
      try {
        flush();
      } catch (error) {
        logger?.log?.(error, "warn");
      }
    }, flushMs);
    if (typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    flush();
  }

  return {
    recordSlash,
    recordEvent,
    flush,
    snapshot,
    guildReport,
    allGuildsReport,
    start,
    stop,
    pending,
  };
}

function noteSlashUse(pulse, interaction) {
  if (!pulse || typeof pulse.recordSlash !== "function") return;
  const guildId = interaction?.guildId || interaction?.guild?.id;
  if (!guildId) return;
  const name = interaction?.commandName;
  try {
    pulse.recordSlash(guildId, name);
  } catch {
    // Hot path: never throw into command dispatch.
  }
}

export {
  STORE_KEY,
  WINDOW_DAYS,
  RETAIN_DAYS,
  FLUSH_MS,
  TOP_N,
  FEATURE_EVENTS,
  FEATURE_LABELS,
  utcDay,
  dayKeysForWindow,
  sanitizeSlashName,
  createMemoryStore,
  createUsagePulse,
  buildGuildStats,
  formatGuildUsageText,
  formatAllGuildsUsageText,
  noteSlashUse,
};
