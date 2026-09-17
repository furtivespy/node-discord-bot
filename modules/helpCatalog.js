import { ApplicationCommandOptionType, PermissionsBitField } from "discord.js";
import {
  collectCommandIds,
  collectHelpFeatures,
  formatCommandMention,
} from "./guildHelpFeatures.js";

/**
 * `/help` reads the live slash-command collection. New commands show up
 * automatically when they load from slashcommands/<area>/.
 *
 * When guild config can be read, overview also sections this-server features
 * (context packs, image gen, chat memory, starboard) and command names become
 * Discord application-command mentions. Missing flags/IDs fail soft to the
 * global `/name` list.
 *
 * Set `category` on the command if the folder is the wrong help group
 * (e.g. chat, admin). Set `hidden: true` for owner-only / internal commands.
 */
const CATEGORY_META = {
  chat: {
    id: "chat",
    label: "Chat",
    emoji: "💬",
    order: 10,
    description: "Talk to Bender and tune how he answers.",
  },
  fun: {
    id: "fun",
    label: "Fun",
    emoji: "🎉",
    order: 20,
    description: "Jokes, quotes, images, and other nonsense.",
  },
  games: {
    id: "games",
    label: "Games",
    emoji: "🎲",
    order: 30,
    description: "Dice and other games.",
  },
  info: {
    id: "info",
    label: "Lookups",
    emoji: "🔎",
    order: 40,
    description: "Wiki, books, board games, space photos, and more.",
  },
  util: {
    id: "util",
    label: "Utilities",
    emoji: "🔧",
    order: 50,
    description: "Status checks and everyday helpers.",
  },
  admin: {
    id: "admin",
    label: "Admin",
    emoji: "🛠️",
    order: 60,
    description: "Server setup. Listed for administrators.",
  },
  nsfw: {
    id: "nsfw",
    label: "NSFW",
    emoji: "🔞",
    order: 70,
    description: "Adult commands. Only listed in NSFW channels.",
  },
};

const HELP_COLOR = 0xe67e22;
const SKIP_USAGE = /^(no usage provided\.?|use this command.*)$/i;
const OVERVIEW_ID = "overview";

function commandJson(cmd) {
  if (!cmd?.data) return {};
  if (typeof cmd.data.toJSON === "function") return cmd.data.toJSON();
  return cmd.data;
}

function categoryIdFor(cmd) {
  const raw = cmd?.help?.category;
  if (raw) return String(raw).toLowerCase();
  return "util";
}

function categoryMeta(id) {
  const key = String(id || "util").toLowerCase();
  if (CATEGORY_META[key]) return CATEGORY_META[key];
  return {
    id: key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    emoji: "📁",
    order: 80,
    description: "More slash commands.",
  };
}

function commandIsNsfw(cmd) {
  if (categoryIdFor(cmd) === "nsfw") return true;
  return Boolean(commandJson(cmd).nsfw);
}

function commandIsAdmin(cmd) {
  if (categoryIdFor(cmd) === "admin") return true;
  const perms = commandJson(cmd).default_member_permissions;
  if (perms == null || perms === "0") return false;
  try {
    return new PermissionsBitField(perms).has(PermissionsBitField.Flags.Administrator);
  } catch {
    return false;
  }
}

function commandAllowsDm(cmd) {
  return commandJson(cmd).dm_permission !== false;
}

function viewerFromInteraction(interaction, client) {
  const ownerId = client?.config?.botOwnerId;
  let isAdmin = false;
  try {
    isAdmin = Boolean(interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator));
  } catch {
    isAdmin = false;
  }
  let commandIds = {};
  let features = { known: false, items: [] };
  try {
    commandIds = collectCommandIds(client, interaction.guild);
  } catch {
    commandIds = {};
  }
  try {
    features = collectHelpFeatures(client, interaction.guild);
  } catch {
    features = { known: false, items: [] };
  }
  return {
    inGuild: Boolean(interaction.guild),
    nsfwChannel: Boolean(interaction.channel?.nsfw),
    isAdmin,
    isOwner: Boolean(ownerId) && ownerId === interaction.user.id,
    commandIds,
    features,
  };
}

function listHelpCommands(slashcommands, viewer = {}) {
  const {
    inGuild = true,
    nsfwChannel = false,
    isAdmin = false,
    isOwner = false,
  } = viewer;
  const commands = [];
  if (!slashcommands) return commands;
  for (const cmd of slashcommands.values()) {
    if (!cmd?.help?.name || cmd.conf?.enabled === false) continue;
    if (cmd.conf?.hidden && !isOwner) continue;
    if (commandIsNsfw(cmd) && !nsfwChannel && !isOwner) continue;
    if (commandIsAdmin(cmd) && !isAdmin && !isOwner) continue;
    if (!inGuild && !commandAllowsDm(cmd)) continue;
    commands.push(cmd);
  }
  return commands.sort((a, b) => a.help.name.localeCompare(b.help.name));
}

function commandDescription(cmd) {
  return String(cmd.help?.description || "No description provided.")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCommandLine(cmd, commandIds = {}) {
  return `${formatCommandMention(cmd.help.name, commandIds)} — ${commandDescription(cmd)}`;
}

function visibleFeatureItems(viewer = {}) {
  const items = viewer.features?.items;
  if (!viewer.features?.known || !Array.isArray(items)) return [];
  return items.filter((item) => !item.adminOnly || viewer.isAdmin || viewer.isOwner);
}

function formatFeatureLine(item, commandIds = {}) {
  const blurb = item.available ? item.availableBlurb : item.unavailableBlurb;
  const mention = item.command ? ` ${formatCommandMention(item.command, commandIds)}` : "";
  return `**${item.label}** — ${blurb}${mention}`.trim();
}

function featureFields(viewer = {}) {
  const items = visibleFeatureItems(viewer);
  if (!items.length) return [];
  const commandIds = viewer.commandIds || {};
  const available = items.filter((item) => item.available);
  const missing = items.filter((item) => !item.available);
  const fields = [];
  if (available.length) {
    fields.push({
      name: "✅ Available here",
      value: available.map((item) => formatFeatureLine(item, commandIds)).join("\n").slice(0, 1024),
    });
  }
  if (missing.length) {
    fields.push({
      name: "🚫 Not set up on this server",
      value: missing.map((item) => formatFeatureLine(item, commandIds)).join("\n").slice(0, 1024),
    });
  }
  return fields;
}

function categoryFeatureNote(categoryId, viewer = {}) {
  const items = visibleFeatureItems(viewer).filter((item) => {
    if (categoryId === "chat") return ["context_packs", "image_gen", "file_search"].includes(item.id);
    if (categoryId === "admin") return item.id === "starboard";
    return false;
  });
  if (!items.length) return "";
  return items
    .map((item) => `${item.label}: ${item.available ? "on" : "not set up"}`)
    .join(" · ");
}

function helpFooter(viewer = {}) {
  if (viewer.features?.known) {
    return { text: "Tap a command name to use it. This-server features are listed first." };
  }
  return { text: "Live slash commands only. This list matches what Bender has loaded." };
}

function usefulUsage(cmd) {
  const usage = String(cmd.help?.usage || "").trim();
  if (!usage || SKIP_USAGE.test(usage)) return null;
  return usage;
}

function formatOptionLine(opt, parentName) {
  const name = parentName ? `${parentName} ${opt.name}` : opt.name;
  const required = opt.required ? " (required)" : "";
  if (
    opt.type === ApplicationCommandOptionType.Subcommand ||
    opt.type === ApplicationCommandOptionType.SubcommandGroup ||
    opt.type === 1 ||
    opt.type === 2
  ) {
    const header = `\`${name}\` — ${opt.description || ""}`.trim();
    const kids = (opt.options || [])
      .map((child) => formatOptionLine(child, name))
      .filter(Boolean);
    return [header, ...kids].join("\n");
  }
  return `\`${name}\`${required} — ${opt.description || ""}`.trim();
}

function formatCommandDetails(cmd) {
  const options = commandJson(cmd).options || [];
  const usage = usefulUsage(cmd);
  const lines = [commandDescription(cmd)];
  if (usage) lines.push("", `Usage: ${usage}`);
  if (options.length) {
    lines.push("", "Options:", ...options.map((opt) => formatOptionLine(opt, cmd.help.name)));
  }
  return lines.join("\n");
}

function groupByCategory(commands) {
  const groups = new Map();
  for (const cmd of commands) {
    const meta = categoryMeta(categoryIdFor(cmd));
    if (!groups.has(meta.id)) groups.set(meta.id, { meta, commands: [] });
    groups.get(meta.id).commands.push(cmd);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.meta.order !== b.meta.order) return a.meta.order - b.meta.order;
    return a.meta.label.localeCompare(b.meta.label);
  });
}

function overviewEmbed(commands, viewer = {}) {
  const commandIds = viewer.commandIds || {};
  const groups = groupByCategory(commands);
  const fields = [
    ...featureFields(viewer),
    ...groups.map(({ meta, commands: cmds }) => ({
      name: `${meta.emoji} ${meta.label}`,
      value: cmds.map((cmd) => formatCommandLine(cmd, commandIds)).join("\n").slice(0, 1024) || "—",
    })),
  ];
  return {
    color: HELP_COLOR,
    title: "Bender — slash commands",
    description: [
      "Mention me in a message to chat. Type `/` and start typing a command name, or pick a category below.",
      "Use `/help command:wiki` for details on one command.",
    ].join("\n\n"),
    fields,
    footer: helpFooter(viewer),
  };
}

function categoryEmbed(categoryId, commands, viewer = {}) {
  const meta = categoryMeta(categoryId);
  const commandIds = viewer.commandIds || {};
  const group = groupByCategory(commands).find((g) => g.meta.id === meta.id);
  const listed = group?.commands || [];
  const note = categoryFeatureNote(categoryId, viewer);
  const commandLines = listed.map((cmd) => formatCommandLine(cmd, commandIds)).join("\n") || "Nothing to show here.";
  return {
    color: HELP_COLOR,
    title: `${meta.emoji} ${meta.label}`,
    description: [meta.description, note, commandLines].filter(Boolean).join("\n\n").slice(0, 4096),
    footer: helpFooter(viewer),
  };
}

function commandEmbed(cmd) {
  return {
    color: HELP_COLOR,
    title: `/${cmd.help.name}`,
    description: formatCommandDetails(cmd).slice(0, 4096),
    footer: { text: `${categoryMeta(categoryIdFor(cmd)).label} · slash command` },
  };
}

function selectOptions(commands, selectedId) {
  const options = [
    {
      label: "Overview",
      value: OVERVIEW_ID,
      description: "All visible slash commands",
      emoji: "📋",
      default: selectedId === OVERVIEW_ID,
    },
  ];
  for (const { meta } of groupByCategory(commands)) {
    options.push({
      label: meta.label,
      value: meta.id,
      description: meta.description.slice(0, 100),
      emoji: meta.emoji,
      default: selectedId === meta.id,
    });
  }
  return options.slice(0, 25);
}

function resolveHelpView(slashcommands, viewer, { commandName, categoryId } = {}) {
  const commands = listHelpCommands(slashcommands, viewer);
  if (commandName) {
    const wanted = String(commandName).replace(/^\//, "").toLowerCase();
    const cmd = commands.find((c) => c.help.name.toLowerCase() === wanted);
    if (cmd) {
      return {
        embed: commandEmbed(cmd),
        selectedId: categoryIdFor(cmd),
        commands,
        note: null,
      };
    }
    return {
      embed: overviewEmbed(commands, viewer),
      selectedId: OVERVIEW_ID,
      commands,
      note: `\`${wanted}\` is not a current slash command you can use here. Browse below or start typing \`/\`.`,
    };
  }
  if (categoryId && categoryId !== OVERVIEW_ID) {
    const visible = commands.some((c) => categoryIdFor(c) === categoryId);
    if (visible) {
      return {
        embed: categoryEmbed(categoryId, commands, viewer),
        selectedId: categoryId,
        commands,
        note: null,
      };
    }
    if (categoryId === "nsfw" && !viewer.nsfwChannel) {
      return {
        embed: overviewEmbed(commands, viewer),
        selectedId: OVERVIEW_ID,
        commands,
        note: "NSFW commands only appear in NSFW channels.",
      };
    }
    if (categoryId === "admin" && !viewer.isAdmin && !viewer.isOwner) {
      return {
        embed: overviewEmbed(commands, viewer),
        selectedId: OVERVIEW_ID,
        commands,
        note: "Admin commands are only listed for server administrators.",
      };
    }
    return {
      embed: overviewEmbed(commands, viewer),
      selectedId: OVERVIEW_ID,
      commands,
      note: "Nothing to show for that category here.",
    };
  }
  return {
    embed: overviewEmbed(commands, viewer),
    selectedId: OVERVIEW_ID,
    commands,
    note: null,
  };
}

function helpContainsPrefixDocs(text) {
  return /(?:^|[\s`])![a-z]/.test(String(text || ""));
}

export {
  CATEGORY_META,
  HELP_COLOR,
  OVERVIEW_ID,
  categoryIdFor,
  categoryMeta,
  commandIsAdmin,
  commandIsNsfw,
  listHelpCommands,
  viewerFromInteraction,
  resolveHelpView,
  selectOptions,
  formatCommandLine,
  formatCommandDetails,
  helpContainsPrefixDocs,
};
