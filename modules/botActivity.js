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

/**
 * Map config/command activity types to discord.js v14 ActivityType enums.
 * Accepts existing config strings ("PLAYING"), names ("Playing"), and numeric enums.
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

export function applyBotActivity(user, activity, activityType) {
  if (!user || typeof user.setActivity !== "function") return;
  return user.setActivity(activity, { type: resolveActivityType(activityType) });
}
