/**
 * Inventory + redacted formatter for /config overview (FUR-64).
 *
 * Source-of-truth settings this report reads:
 *
 * Enmap `settings` (per guild, merged over config.defaultSettings):
 *   prefix, randRspPct, markovLevel, ai_selected_personality,
 *   adminRole, modRole, systemNotice,
 *   mentionCooldown / mention_cooldown / ai_mention_cooldown / mentionCooldownMs
 *     (not written by current chat code — FUR-23 is prompt-only; still shown if set via !set)
 *   context_packs (FUR-62) plus legacy contextPackUrl / publishedCsvUrl / csvUrl
 *     and similar keys (yes/no only — never print the URL)
 *
 * Enmap `exclusions` — disabled prefix commands
 * Enmap `skipChannels` — channels excluded from Markov ingest / backfill
 * Enmap `gamedata.STARBOARD` — channel / emoji / minimum
 * Enmap `gamedata.BRINGO` — whether a game is active
 *
 * SQLite per guild (`data/<guildId>.sqlite`):
 *   File Search store + uploaded transcript count (hasFileSearchReady)
 *   backfill_worker.status
 *   people row count
 *
 * Env / config.json (global, not dumped here):
 *   token, geminiKey, google_key, bugsnagKey, LOTR_API_KEY, BGGToken, botOwnerId, admins
 */
const PERSONALITY_NAMES = {
  bender: "Bender",
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

const MENTION_COOLDOWN_KEYS = [
  "mentionCooldown",
  "mention_cooldown",
  "ai_mention_cooldown",
  "mentionCooldownMs",
];

const CONTEXT_PACK_KEYS = [
  "context_packs",
  "contextPackUrl",
  "publishedCsvUrl",
  "csvUrl",
  "contextUrl",
  "context_pack_url",
  "extraContextUrl",
  "contextPack",
  "publishedCsv",
  "contextCsvUrl",
  "context_csv_url",
];

const DISPLAYED_SETTING_KEYS = new Set([
  "prefix",
  "randRspPct",
  "markovLevel",
  "ai_selected_personality",
  "adminRole",
  "modRole",
  "systemNotice",
  ...MENTION_COOLDOWN_KEYS,
  ...CONTEXT_PACK_KEYS,
]);

const SECRET_KEY_RE =
  /token|secret|password|passwd|api[_-]?key|(^|_)key$|gemini|bugsnag|auth|credential|bearer|cxid/i;
const SECRET_VALUE_RE =
  /^(sk-|ghp_|github_pat_|gho_|xox[baprs]-|AIza|ya29\.|EAA[A-Za-z0-9]|AKIA[0-9A-Z]{16}|Bearer\s+)/i;
const CONTEXT_PACK_KEY_RE = /context.?pack|published.?csv|csv.?url|context.?url|extra.?context/i;
const URL_VALUE_RE = /^(https?|ftp|sftp|ftps|s3|gs):\/\//i;

function asPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

function asStringArray(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function configuredAdminIds(config = {}) {
  const ids = [];
  if (config.botOwnerId) ids.push(String(config.botOwnerId));
  for (const list of [config.admins, config.adminIds]) {
    if (Array.isArray(list)) ids.push(...list.map(String));
  }
  return new Set(ids.filter(Boolean));
}

function isBotAdmin(client, userId) {
  if (!userId) return false;
  const id = String(userId);
  if (configuredAdminIds(client?.config).has(id)) return true;
  const owner = client?.appInfo?.owner;
  if (owner?.id && String(owner.id) === id) return true;
  return false;
}

function looksLikeUrl(value) {
  return typeof value === "string" && URL_VALUE_RE.test(value.trim());
}

function looksLikeSecretValue(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (looksLikeUrl(trimmed) || SECRET_VALUE_RE.test(trimmed)) return true;
  return trimmed.length >= 32 && /^[A-Za-z0-9+/=._-]{32,}$/.test(trimmed);
}

function isSecretKey(key) {
  return SECRET_KEY_RE.test(String(key));
}

function isContextPackKey(key) {
  const name = String(key);
  return CONTEXT_PACK_KEYS.includes(name) || CONTEXT_PACK_KEY_RE.test(name);
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function isEmptySetting(value) {
  return value === undefined || value === null || value === "";
}

function redactSettingValue(key, value) {
  if (isEmptySetting(value)) return null;
  if (
    isSecretKey(key) ||
    isContextPackKey(key) ||
    looksLikeUrl(value) ||
    looksLikeSecretValue(value)
  ) {
    return "configured";
  }
  if (typeof value === "object") return "configured";
  return String(value);
}

function settingField(merged, overrides, key) {
  if (isEmptySetting(merged[key])) {
    return {
      value: "unset",
      source: hasOwn(overrides, key) ? "override" : "default",
    };
  }
  return {
    value: redactSettingValue(key, merged[key]),
    source: settingSource(overrides, key),
  };
}

function settingSource(overrides, key) {
  return hasOwn(overrides, key) ? "override" : "default";
}

function findFirstKey(objects, keys) {
  for (const key of keys) {
    for (const object of objects) {
      if (hasOwn(object, key) && !isEmptySetting(object[key])) {
        return { key, value: object[key] };
      }
    }
  }
  return null;
}

function personalitySnapshot(settings, overrides) {
  const raw = settings.ai_selected_personality;
  const key = isEmptySetting(raw) ? "bender" : String(raw);
  const set = hasOwn(overrides, "ai_selected_personality") && !isEmptySetting(overrides.ai_selected_personality);
  return {
    key,
    name: PERSONALITY_NAMES[key] || key,
    set,
    source: set ? "override" : "default",
    preview: PERSONALITY_NAMES[key] ? PERSONALITY_NAMES[key] : `${key} (unknown)`,
  };
}

function mentionCooldownSnapshot(settings, overrides) {
  const found = findFirstKey([overrides, settings], MENTION_COOLDOWN_KEYS);
  if (!found) {
    return { configured: false, source: "unset", display: "unset (prompt-only)" };
  }
  return {
    configured: true,
    key: found.key,
    source: settingSource(overrides, found.key),
    display: redactSettingValue(found.key, found.value),
  };
}

function contextPackSnapshot(settings, overrides) {
  const keys = new Set([
    ...CONTEXT_PACK_KEYS,
    ...Object.keys(overrides),
    ...Object.keys(settings),
  ]);
  const configuredKeys = [];
  for (const key of keys) {
    if (!isContextPackKey(key)) continue;
    const value = hasOwn(overrides, key) ? overrides[key] : settings[key];
    if (Array.isArray(value) && value.length === 0) continue;
    if (!isEmptySetting(value)) configuredKeys.push(key);
  }
  return {
    configured: configuredKeys.length > 0,
    keys: configuredKeys,
  };
}

function extraOverrideSnapshot(overrides) {
  const extras = [];
  for (const [key, value] of Object.entries(overrides)) {
    if (DISPLAYED_SETTING_KEYS.has(key)) continue;
    extras.push({
      key,
      value: redactSettingValue(key, value) ?? "unset",
    });
  }
  return extras;
}

function buildGuildSnapshot({
  guildId,
  guildName,
  settings = {},
  overrides = {},
  exclusions = [],
  skipChannels = [],
  starboard = {},
  bringo = {},
  fileSearchReady = false,
  fileSearchStore = false,
  transcriptUploaded = 0,
  backfillStatus = "unknown",
  peopleCount = 0,
  dbError = false,
}) {
  const merged = asPlainObject(settings);
  const guildOverrides = asPlainObject(overrides);
  const personality = personalitySnapshot(merged, guildOverrides);
  const mentionCooldown = mentionCooldownSnapshot(merged, guildOverrides);
  const contextPack = contextPackSnapshot(merged, guildOverrides);
  const starboardChannel = starboard.starboardChannel || starboard.starboardChannelId;

  return {
    id: String(guildId),
    name: guildName || "(unknown guild)",
    personality,
    prefix: settingField(merged, guildOverrides, "prefix"),
    randRspPct: settingField(merged, guildOverrides, "randRspPct"),
    markovLevel: settingField(merged, guildOverrides, "markovLevel"),
    adminRole: settingField(merged, guildOverrides, "adminRole"),
    modRole: settingField(merged, guildOverrides, "modRole"),
    systemNotice: settingField(merged, guildOverrides, "systemNotice"),
    mentionCooldown,
    contextPack,
    fileSearch: {
      ready: Boolean(fileSearchReady),
      store: Boolean(fileSearchStore),
      uploaded: Number(transcriptUploaded) || 0,
    },
    backfillStatus: backfillStatus || "unknown",
    peopleCount: Number(peopleCount) || 0,
    starboard: starboardChannel
      ? {
          configured: true,
          channel: String(starboard.starboardChannel || starboard.starboardChannelId),
          emoji: starboard.starEmoji || "⭐",
          minimum: starboard.minimumStarCount ?? 3,
        }
      : { configured: false },
    bringo: {
      active: Boolean(bringo.isGameActive),
      words: Array.isArray(bringo.wordlist) ? bringo.wordlist.length : 0,
    },
    exclusions: asStringArray(exclusions),
    skipChannelCount: asStringArray(skipChannels).length,
    extras: extraOverrideSnapshot(guildOverrides),
    dbError: Boolean(dbError),
  };
}

function safeDbSnapshot(client, guildId) {
  try {
    const db = client.getDatabase(guildId);
    const transcripts = db.getTranscriptSummary?.() || {};
    const worker = db.getBackfillWorker?.() || {};
    const people = typeof db.listPeople === "function" ? db.listPeople() : [];
    return {
      fileSearchReady: Boolean(db.hasFileSearchReady?.()),
      fileSearchStore: Boolean(worker.file_search_store),
      transcriptUploaded: Number(transcripts.uploaded || 0),
      backfillStatus: worker.status || "unknown",
      peopleCount: people.length,
      dbError: false,
    };
  } catch {
    return {
      fileSearchReady: false,
      fileSearchStore: false,
      transcriptUploaded: 0,
      backfillStatus: "unavailable",
      peopleCount: 0,
      dbError: true,
    };
  }
}

function collectGuildOverview(client, guild) {
  const defaults = asPlainObject(
    client.settings?.get?.("default") || client.config?.defaultSettings
  );
  const overrides = asPlainObject(client.settings?.get?.(guild.id));
  const settings = { ...defaults, ...overrides };
  const db = safeDbSnapshot(client, guild.id);
  return buildGuildSnapshot({
    guildId: guild.id,
    guildName: guild.name,
    settings,
    overrides,
    exclusions: client.getExclusions?.(guild) || [],
    skipChannels: client.getSkipChannels?.(guild) || [],
    starboard: client.getGameData?.(guild, "STARBOARD") || {},
    bringo: client.getGameData?.(guild, "BRINGO") || {},
    ...db,
  });
}

function collectAllGuildOverviews(client, guilds) {
  const list = Array.from(guilds || []);
  list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return list.map((guild) => collectGuildOverview(client, guild));
}

function marked(item) {
  if (!item) return "unset";
  const value = item.value ?? item.display ?? "unset";
  return item.source === "default" ? `${value} (default)` : value;
}

function formatGuildSection(snapshot) {
  const personality = snapshot.personality.set
    ? snapshot.personality.preview
    : `${snapshot.personality.preview} (default)`;
  const randRsp =
    snapshot.randRspPct.value === "unset"
      ? marked(snapshot.randRspPct)
      : marked({
          value: `${snapshot.randRspPct.value}%`,
          source: snapshot.randRspPct.source,
        });
  const fileSearch = snapshot.fileSearch.ready
    ? `ready (${snapshot.fileSearch.uploaded} uploaded)`
    : snapshot.fileSearch.store
      ? `store only, not ready (${snapshot.fileSearch.uploaded} uploaded)`
      : "no";
  const starboard = snapshot.starboard.configured
    ? `#${snapshot.starboard.channel} · ${snapshot.starboard.emoji} · min ${snapshot.starboard.minimum}`
    : "unset";
  const bringo = snapshot.bringo.active
    ? `active (${snapshot.bringo.words} words)`
    : "off";
  const disabled = snapshot.exclusions.length
    ? snapshot.exclusions.join(", ")
    : "none";
  const extras = snapshot.extras.length
    ? snapshot.extras.map((item) => `${item.key}=${item.value}`).join(" · ")
    : "none";
  const dbNote = snapshot.dbError ? " · sqlite unavailable" : "";

  return [
    `**${snapshot.name}** — \`${snapshot.id}\``,
    `Personality: ${personality}`,
    `Chat: prefix \`${marked(snapshot.prefix)}\` · randRsp ${randRsp} · markov ${marked(snapshot.markovLevel)} · mention cooldown ${snapshot.mentionCooldown.display}`,
    `Roles: admin ${marked(snapshot.adminRole)} · mod ${marked(snapshot.modRole)} · systemNotice ${marked(snapshot.systemNotice)}`,
    `Context pack: ${snapshot.contextPack.configured ? "yes" : "no"}`,
    `File Search: ${fileSearch} · backfill ${snapshot.backfillStatus} · people ${snapshot.peopleCount}${dbNote}`,
    `Starboard: ${starboard} · Bringo: ${bringo}`,
    `Disabled cmds: ${disabled} · skip channels: ${snapshot.skipChannelCount}`,
    `Other overrides: ${extras}`,
  ].join("\n");
}

function formatOverviewText(snapshots) {
  const header = [
    `**Multi-server config** (${snapshots.length} guild${snapshots.length === 1 ? "" : "s"})`,
    "Bot owner / configured admin IDs only. Secrets and full URLs are redacted.",
    "`(default)` means inherited from config.defaultSettings, not overridden on that guild.",
    "",
  ];
  if (!snapshots.length) {
    return header.join("\n") + "No joined guilds.";
  }
  return header.join("\n") + snapshots.map(formatGuildSection).join("\n\n");
}

function formatOverviewJson(snapshots) {
  return JSON.stringify({ guilds: snapshots }, null, 2);
}

function splitDiscordMessages(text, max = 1900) {
  if (text.length <= max) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf("\n\n", max);
    if (cut < Math.floor(max / 2)) cut = remaining.lastIndexOf("\n", max);
    if (cut < Math.floor(max / 2)) cut = max;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export {
  PERSONALITY_NAMES,
  MENTION_COOLDOWN_KEYS,
  CONTEXT_PACK_KEYS,
  configuredAdminIds,
  isBotAdmin,
  redactSettingValue,
  looksLikeUrl,
  looksLikeSecretValue,
  isSecretKey,
  isContextPackKey,
  buildGuildSnapshot,
  collectGuildOverview,
  collectAllGuildOverviews,
  formatOverviewText,
  formatOverviewJson,
  splitDiscordMessages,
};
