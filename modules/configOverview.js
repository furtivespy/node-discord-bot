/**
 * Inventory + formatter for /config overview (FUR-64).
 *
 * Per-guild stores this report reads (source of truth):
 *
 * Enmap `settings` (merged with config.defaultSettings):
 *   prefix, randRspPct, markovLevel, ai_selected_personality,
 *   adminRole, modRole, systemNotice
 *   plus leftover overrides (URLs/secrets are redacted, never printed)
 *
 * Enmap `exclusions`: disabled prefix-command names
 * Enmap `skipChannels`: channel IDs skipped from Markov ingest
 * Enmap `gamedata.STARBOARD`: starboardChannel / starboardChannelId / …
 *
 * SQLite `data/{guildId}.sqlite`:
 *   people, backfill_worker (file_search_store, status),
 *   transcript_exports (File Search upload count)
 *
 * Not stored yet (shown as missing):
 *   mention cooldown (FUR-23 shipped first-chunk mention stripping, no Enmap key)
 *   context pack / published CSV URL (FUR-62 still open)
 *
 * Global config.json / env (not listed per guild): token, geminiKey,
 *   google_key, API keys, botOwnerId, adminIds.
 */

const PERSONALITY_LABELS = {
  bender: "Bender (Default)",
  detective: "Hardboiled AI Detective",
  zenmaster_nj: "Zen Master (New Jersey)",
  dwarf_craftsman: "Grumpy Dwarven Craftsman",
  ship_computer: "Ship's Computer",
  educator_joy: "Enthusiastic Educator",
  oracle_sigh: "Reluctant Oracle",
  shakespeare: "Shakespearean Actor",
  pirate_qm: "Pirate Quartermaster",
  anxious_philosopher: "Anxious Philosopher",
  chicago_pope: "The Chicago Pope",
};

const KNOWN_SETTING_KEYS = [
  "prefix",
  "randRspPct",
  "markovLevel",
  "ai_selected_personality",
  "adminRole",
  "modRole",
  "systemNotice",
];

const CONTEXT_PACK_KEYS = [
  "contextPackUrl",
  "publishedCsvUrl",
  "contextUrl",
  "csvUrl",
  "contextPack",
  "context_pack_url",
  "published_csv_url",
];

const MENTION_COOLDOWN_KEYS = [
  "mentionCooldown",
  "mention_cooldown",
  "mentionCooldownMs",
];

const SECRET_KEY = /token|key|secret|password|webhook|csv|url|endpoint|auth/i;
const DISCORD_CONTENT_LIMIT = 1900;

function isConfigAdmin(userId, config = {}) {
  if (!userId) return false;
  if (config.botOwnerId && String(config.botOwnerId) === String(userId)) return true;
  const extra = [];
  if (Array.isArray(config.adminIds)) extra.push(...config.adminIds);
  if (Array.isArray(config.admins)) extra.push(...config.admins);
  return extra.some((id) => String(id) === String(userId));
}

function hasOwn(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function isEmpty(value) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

function redactSetting(key, value) {
  if (isEmpty(value)) return { configured: false, display: "no" };
  if (isHttpUrl(value) || SECRET_KEY.test(String(key))) {
    return { configured: true, display: "yes (redacted)" };
  }
  return { configured: true, display: String(value) };
}

function findFirstKey(obj, keys) {
  if (!obj) return null;
  for (const key of keys) {
    if (hasOwn(obj, key) && !isEmpty(obj[key])) return key;
  }
  return null;
}

function collectGuilds(client) {
  const cache = client.guilds && client.guilds.cache;
  if (!cache) return [];
  if (typeof cache.values === "function") return Array.from(cache.values());
  if (Array.isArray(cache)) return cache;
  return Object.values(cache);
}

function collectGuildSnapshot(client, guild) {
  const defaults =
    (client.settings && client.settings.get("default")) ||
    (client.config && client.config.defaultSettings) ||
    {};
  const overrides = (client.settings && client.settings.get(guild.id)) || {};
  const settings = client.getSettings
    ? client.getSettings(guild)
    : { ...defaults, ...overrides };

  const personalityKey = settings.ai_selected_personality || "bender";
  const personalitySet =
    hasOwn(overrides, "ai_selected_personality") &&
    !isEmpty(overrides.ai_selected_personality);
  const personalityLabel =
    PERSONALITY_LABELS[personalityKey] || personalityKey || "Bender (Default)";

  const mentionSource = findFirstKey(overrides, MENTION_COOLDOWN_KEYS) ||
    findFirstKey(settings, MENTION_COOLDOWN_KEYS);
  let mentionCooldown = "no (not stored)";
  if (mentionSource) {
    const raw = hasOwn(overrides, mentionSource)
      ? overrides[mentionSource]
      : settings[mentionSource];
    mentionCooldown = isHttpUrl(raw) ? "yes (redacted)" : String(raw);
  }

  const contextSource = findFirstKey(overrides, CONTEXT_PACK_KEYS) ||
    findFirstKey(settings, CONTEXT_PACK_KEYS);
  const contextPack = contextSource
    ? redactSetting(contextSource, overrides[contextSource] ?? settings[contextSource]).display
    : "no";

  const otherOverrides = [];
  for (const [key, value] of Object.entries(overrides)) {
    if (KNOWN_SETTING_KEYS.includes(key)) continue;
    if (CONTEXT_PACK_KEYS.includes(key)) continue;
    if (MENTION_COOLDOWN_KEYS.includes(key)) continue;
    otherOverrides.push(`${key}=${redactSetting(key, value).display}`);
  }

  let fileSearchReady = false;
  let fileSearchStore = false;
  let fileSearchUploaded = 0;
  let fileSearchError = null;
  let peopleCount = 0;
  let backfillStatus = "unset";
  try {
    if (client.getDatabase) {
      const db = client.getDatabase(guild.id);
      fileSearchReady = Boolean(db.hasFileSearchReady && db.hasFileSearchReady());
      fileSearchStore = Boolean(db.getFileSearchStore && db.getFileSearchStore());
      const transcripts = db.getTranscriptSummary ? db.getTranscriptSummary() : null;
      fileSearchUploaded = (transcripts && transcripts.uploaded) || 0;
      peopleCount = db.listPeople ? db.listPeople().length : 0;
      const worker = db.getBackfillWorker ? db.getBackfillWorker() : null;
      backfillStatus = (worker && worker.status) || "unset";
    }
  } catch (e) {
    fileSearchError = "unavailable";
  }

  const exclusions = client.getExclusions ? client.getExclusions(guild) : [];
  const skipChannels = client.getSkipChannels ? client.getSkipChannels(guild) : [];
  const starboard = client.getGameData ? client.getGameData(guild, "STARBOARD") : {};

  return {
    id: guild.id,
    name: guild.name || "(unknown)",
    personality: {
      set: personalitySet,
      key: personalityKey,
      label: personalityLabel,
    },
    prefix: {
      value: settings.prefix,
      override: hasOwn(overrides, "prefix"),
    },
    randRspPct: {
      value: settings.randRspPct,
      override: hasOwn(overrides, "randRspPct"),
    },
    markovLevel: {
      value: settings.markovLevel,
      override: hasOwn(overrides, "markovLevel"),
    },
    mentionCooldown,
    contextPack,
    fileSearchReady,
    fileSearchStore,
    fileSearchUploaded,
    fileSearchError,
    peopleCount,
    backfillStatus,
    exclusions: Array.isArray(exclusions) ? exclusions : [],
    skipChannelCount: Array.isArray(skipChannels) ? skipChannels.length : 0,
    starboard: starboard && starboard.starboardChannelId
      ? { configured: true, channel: starboard.starboardChannel || starboard.starboardChannelId }
      : { configured: false },
    adminRole: {
      value: settings.adminRole,
      override: hasOwn(overrides, "adminRole"),
    },
    modRole: {
      value: settings.modRole,
      override: hasOwn(overrides, "modRole"),
    },
    otherOverrides,
  };
}

function formatKnob(label, field, suffix = "") {
  if (isEmpty(field.value) && field.value !== 0) return `${label} unset`;
  const shown = `${field.value}${suffix}`;
  return field.override ? `${label} ${shown}` : `${label} ${shown} (default)`;
}

function formatFileSearch(snap) {
  if (snap.fileSearchError) return "unavailable";
  if (snap.fileSearchReady) return `yes (${snap.fileSearchUploaded} uploaded)`;
  if (snap.fileSearchStore) return "store only (0 uploaded)";
  return "no";
}

function formatGuildSection(snap) {
  const personality = snap.personality.set
    ? snap.personality.label
    : `no (default ${snap.personality.label})`;
  const starboard = snap.starboard.configured
    ? `#${snap.starboard.channel}`
    : "no";

  const extras = [];
  if (snap.exclusions.length) extras.push(`disabled: ${snap.exclusions.join(", ")}`);
  if (snap.skipChannelCount) extras.push(`skip ${snap.skipChannelCount} ch`);
  extras.push(`${snap.peopleCount} people`);
  extras.push(`backfill ${snap.backfillStatus}`);
  extras.push(`starboard ${starboard}`);
  extras.push(
    `roles ${formatKnob("admin", snap.adminRole)} / ${formatKnob("mod", snap.modRole)}`
  );
  if (snap.otherOverrides.length) extras.push(`other: ${snap.otherOverrides.join(", ")}`);

  return [
    `**${snap.name}** (\`${snap.id}\`)`,
    `- Personality: ${personality}`,
    `- Chat knobs: ${formatKnob("prefix", snap.prefix)} · ${formatKnob("randRsp", snap.randRspPct, "%")} · ${formatKnob("markov", snap.markovLevel)} · mention cooldown: ${snap.mentionCooldown}`,
    `- Context pack / CSV: ${snap.contextPack}`,
    `- File Search ready: ${formatFileSearch(snap)}`,
    `- Flags: ${extras.join(" · ")}`,
  ].join("\n");
}

function buildOverviewReport(client) {
  const guilds = collectGuilds(client).sort((a, b) =>
    String(a.name || a.id).localeCompare(String(b.name || b.id))
  );
  const snapshots = guilds.map((guild) => collectGuildSnapshot(client, guild));
  const header = `**Bender config overview** — ${snapshots.length} guild${
    snapshots.length === 1 ? "" : "s"
  } (owner/admin only, ephemeral)`;
  if (!snapshots.length) {
    return { text: `${header}\n\nNo joined guilds.`, snapshots };
  }
  return {
    text: `${header}\n\n${snapshots.map(formatGuildSection).join("\n\n")}`,
    snapshots,
  };
}

function splitDiscordMessages(text, max = DISCORD_CONTENT_LIMIT) {
  if (!text) return ["(empty)"];
  if (text.length <= max) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.4) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

module.exports = {
  PERSONALITY_LABELS,
  CONTEXT_PACK_KEYS,
  MENTION_COOLDOWN_KEYS,
  KNOWN_SETTING_KEYS,
  isConfigAdmin,
  redactSetting,
  collectGuildSnapshot,
  buildOverviewReport,
  splitDiscordMessages,
  formatGuildSection,
};
