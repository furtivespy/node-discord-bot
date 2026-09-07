const { ApplicationCommandOptionType, PermissionsBitField } = require("discord.js");

/**
 * `/help` reads the live slash-command collection. New commands show up
 * automatically when they load from slashcommands/<area>/.
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
  return {
    inGuild: Boolean(interaction.guild),
    nsfwChannel: Boolean(interaction.channel?.nsfw),
    isAdmin,
    isOwner: Boolean(ownerId) && ownerId === interaction.user.id,
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

function formatCommandLine(cmd) {
  return `\`/${cmd.help.name}\` — ${commandDescription(cmd)}`;
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

function overviewEmbed(commands) {
  const groups = groupByCategory(commands);
  const fields = groups.map(({ meta, commands: cmds }) => ({
    name: `${meta.emoji} ${meta.label}`,
    value: cmds.map(formatCommandLine).join("\n").slice(0, 1024) || "—",
  }));
  return {
    color: HELP_COLOR,
    title: "Bender — slash commands",
    description: [
      "Mention me in a message to chat. Type `/` and start typing a command name, or pick a category below.",
      "Use `/help command:wiki` for details on one command.",
    ].join("\n\n"),
    fields,
    footer: { text: "Live slash commands only. This list matches what Bender has loaded." },
  };
}

function categoryEmbed(categoryId, commands) {
  const meta = categoryMeta(categoryId);
  const group = groupByCategory(commands).find((g) => g.meta.id === meta.id);
  const listed = group?.commands || [];
  return {
    color: HELP_COLOR,
    title: `${meta.emoji} ${meta.label}`,
    description: [meta.description, "", listed.map(formatCommandLine).join("\n") || "Nothing to show here."]
      .join("\n")
      .slice(0, 4096),
    footer: { text: "Live slash commands only. This list matches what Bender has loaded." },
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
      embed: overviewEmbed(commands),
      selectedId: OVERVIEW_ID,
      commands,
      note: `\`${wanted}\` is not a current slash command you can use here. Browse below or start typing \`/\`.`,
    };
  }
  if (categoryId && categoryId !== OVERVIEW_ID) {
    const visible = commands.some((c) => categoryIdFor(c) === categoryId);
    if (visible) {
      return {
        embed: categoryEmbed(categoryId, commands),
        selectedId: categoryId,
        commands,
        note: null,
      };
    }
    if (categoryId === "nsfw" && !viewer.nsfwChannel) {
      return {
        embed: overviewEmbed(commands),
        selectedId: OVERVIEW_ID,
        commands,
        note: "NSFW commands only appear in NSFW channels.",
      };
    }
    if (categoryId === "admin" && !viewer.isAdmin && !viewer.isOwner) {
      return {
        embed: overviewEmbed(commands),
        selectedId: OVERVIEW_ID,
        commands,
        note: "Admin commands are only listed for server administrators.",
      };
    }
    return {
      embed: overviewEmbed(commands),
      selectedId: OVERVIEW_ID,
      commands,
      note: "Nothing to show for that category here.",
    };
  }
  return {
    embed: overviewEmbed(commands),
    selectedId: OVERVIEW_ID,
    commands,
    note: null,
  };
}

function helpContainsPrefixDocs(text) {
  return /(?:^|[\s`])![a-z]/.test(String(text || ""));
}

module.exports = {
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
