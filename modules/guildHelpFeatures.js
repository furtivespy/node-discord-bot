/**
 * Server-aware flags for `/help` (FUR-76).
 *
 * Inventory of “enabled on this guild” checks:
 *   context_packs — Enmap settings `context_packs` plus legacy CSV/URL keys
 *     (same presence rules as /config overview). `/context` is the setup command.
 *   image_gen — optional guild flag `image_gen` / `imageGen` / `enableImageGen` /
 *     `enable_image_gen`; if unset, fall back to process-wide `config.geminiKey`
 *     (chat image callouts, not a slash command).
 *   file_search — SQLite `hasFileSearchReady()` (chat memory / backfill).
 *   starboard — gamedata.STARBOARD channel set (admin/mod tool).
 *
 * Any missing API (no guild, Enmap throw, no command IDs) fails soft: callers
 * omit the this-server section and render `/name` instead of mentions.
 */
import { contextPackSnapshot } from "./guildConfigOverview.js";

const IMAGE_GEN_KEYS = ["image_gen", "imageGen", "enableImageGen", "enable_image_gen"];

const TRUTHY = new Set(["true", "yes", "on", "1", "enabled"]);
const FALSEY = new Set(["false", "no", "off", "0", "disabled"]);

function isEnabledFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null || value === "") return false;
  const text = String(value).trim().toLowerCase();
  if (FALSEY.has(text)) return false;
  if (TRUTHY.has(text)) return true;
  return true;
}

function firstOwnValue(object, keys) {
  if (!object || typeof object !== "object") return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key) && object[key] != null && object[key] !== "") {
      return object[key];
    }
  }
  return undefined;
}

function imageGenAvailable(settings = {}, config = {}) {
  const guildFlag = firstOwnValue(settings, IMAGE_GEN_KEYS);
  if (guildFlag !== undefined) return isEnabledFlag(guildFlag);
  const globalFlag = firstOwnValue(config, IMAGE_GEN_KEYS);
  if (globalFlag !== undefined) return isEnabledFlag(globalFlag);
  return Boolean(config.geminiKey);
}

function starboardConfigured(starboard = {}) {
  return Boolean(starboard.starboardChannel || starboard.starboardChannelId);
}

function fileSearchReady(client, guildId) {
  try {
    return Boolean(client.getDatabase?.(guildId)?.hasFileSearchReady?.());
  } catch {
    return false;
  }
}

function collectHelpFeatures(client, guild) {
  if (!guild) return { known: false, items: [] };
  try {
    const settings = client.getSettings?.(guild) || {};
    const starboard = client.getGameData?.(guild, "STARBOARD") || {};
    const packs = contextPackSnapshot(settings, {});
    const items = [
      {
        id: "context_packs",
        label: "Context packs",
        available: Boolean(packs.configured),
        command: "context",
        availableBlurb: "Chat can use this server's play tracker / notes.",
        unavailableBlurb: "No pack registered. Add a published CSV with this command.",
      },
      {
        id: "image_gen",
        label: "Image generation",
        available: imageGenAvailable(settings, client.config || {}),
        availableBlurb: "Mention Bender and ask for an image.",
        unavailableBlurb: "Not enabled on this server.",
      },
      {
        id: "file_search",
        label: "Chat memory",
        available: fileSearchReady(client, guild.id),
        command: "backfill",
        availableBlurb: "Older channel history can ground answers.",
        unavailableBlurb: "History crawl has not produced a File Search store yet.",
      },
      {
        id: "starboard",
        label: "Starboard",
        available: starboardConfigured(starboard),
        command: "starboard",
        adminOnly: true,
        availableBlurb: "Starred messages post to the configured channel.",
        unavailableBlurb: "No starboard channel set.",
      },
    ];
    return { known: true, items };
  } catch {
    return { known: false, items: [] };
  }
}

function addCommandId(ids, name, id) {
  if (name && id) ids[String(name)] = String(id);
}

function ingestCommandIds(ids, source) {
  if (!source) return;
  if (typeof source.values === "function") {
    for (const cmd of source.values()) addCommandId(ids, cmd?.name, cmd?.id);
    return;
  }
  if (Array.isArray(source)) {
    for (const cmd of source) addCommandId(ids, cmd?.name, cmd?.id);
    return;
  }
  if (typeof source === "object") {
    for (const [name, value] of Object.entries(source)) {
      if (value && typeof value === "object") {
        addCommandId(ids, value.name || name, value.id);
      } else {
        addCommandId(ids, name, value);
      }
    }
  }
}

function rememberSlashCommandIds(client, commands) {
  if (!client) return;
  const ids = { ...(client.slashCommandIds || {}) };
  ingestCommandIds(ids, commands);
  client.slashCommandIds = ids;
}

function collectCommandIds(client, guild) {
  const ids = {};
  ingestCommandIds(ids, client?.slashCommandIds);
  ingestCommandIds(ids, client?.application?.commands?.cache);
  ingestCommandIds(ids, guild?.commands?.cache);
  return ids;
}

async function ensureSlashCommandIds(client, guild) {
  try {
    if (client?.slashCommandIds && Object.keys(client.slashCommandIds).length) {
      return client.slashCommandIds;
    }
    const guildFetched = guild?.commands?.fetch ? await guild.commands.fetch() : null;
    if (guildFetched?.size) {
      rememberSlashCommandIds(client, [...guildFetched.values()]);
      return client.slashCommandIds;
    }
    const globalFetched = client?.application?.commands?.fetch
      ? await client.application.commands.fetch()
      : null;
    if (globalFetched) {
      rememberSlashCommandIds(
        client,
        typeof globalFetched.values === "function" ? [...globalFetched.values()] : globalFetched
      );
    }
  } catch {
    // Cache miss / API error: keep `/name` fallback.
  }
  return client?.slashCommandIds || {};
}

function formatCommandMention(name, commandIds = {}) {
  if (!name) return "";
  const id = commandIds[name];
  if (id) return `</${name}:${id}>`;
  return `\`/${name}\``;
}

export {
  IMAGE_GEN_KEYS,
  collectHelpFeatures,
  collectCommandIds,
  rememberSlashCommandIds,
  ensureSlashCommandIds,
  formatCommandMention,
  imageGenAvailable,
};
