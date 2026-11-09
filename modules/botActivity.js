import { ActivityType } from "discord.js";

const NAMED_ACTIVITY_TYPES = {
  PLAYING: ActivityType.Playing,
  STREAMING: ActivityType.Streaming,
  LISTENING: ActivityType.Listening,
  WATCHING: ActivityType.Watching,
  COMPETING: ActivityType.Competing,
  CUSTOM: ActivityType.Custom,
};

const ACTIVITY_TYPE_VALUES = new Set(Object.values(NAMED_ACTIVITY_TYPES));

const STREAMING_HOSTS = new Set(["twitch.tv", "youtube.com", "youtu.be"]);

/**
 * Activity types offered by `/statusupdate`. Custom is omitted because Discord
 * does not show custom status for bots.
 */
export const STATUS_UPDATE_CHOICES = [
  { name: "Playing", value: "PLAYING" },
  { name: "Listening", value: "LISTENING" },
  { name: "Watching", value: "WATCHING" },
  { name: "Streaming", value: "STREAMING" },
  { name: "Competing", value: "COMPETING" },
];

const STATUS_UPDATE_TYPE_NAMES = new Set(
  STATUS_UPDATE_CHOICES.map((choice) => choice.value)
);

/**
 * Map config/command activity types to discord.js v14 ActivityType enums.
 * Accepts existing config strings ("PLAYING"), names ("Playing"), and numeric enums.
 * Unknown values fall back to Playing so stored config still applies on startup.
 */
export function resolveActivityType(value) {
  if (typeof value === "number" && ACTIVITY_TYPE_VALUES.has(value)) {
    return value;
  }
  if (typeof value === "string") {
    const mapped = NAMED_ACTIVITY_TYPES[value.trim().toUpperCase()];
    if (mapped !== undefined) return mapped;
  }
  return ActivityType.Playing;
}

/**
 * Strict parser for `/statusupdate` dropdown values. Returns the stored config
 * string (PLAYING, …) or null when the choice is not in the public list.
 */
export function parseStatusUpdateType(value) {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  return STATUS_UPDATE_TYPE_NAMES.has(key) ? key : null;
}

export function isStreamingUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (STREAMING_HOSTS.has(host)) return true;
    return [...STREAMING_HOSTS].some((allowed) => host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

export function applyBotActivity(user, activity, activityType, extras = {}) {
  if (!user || typeof user.setActivity !== "function") return;
  const type = resolveActivityType(activityType);
  const options = { type };
  if (type === ActivityType.Streaming && extras.url) {
    options.url = extras.url;
  }
  return user.setActivity(activity, options);
}
