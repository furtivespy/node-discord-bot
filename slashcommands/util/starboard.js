const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const { PermissionsBitField, ChannelType } = require("discord.js");

const EmptyStarboardData = {
  starboardChannel: undefined,
  starboardChannelId: undefined,
  starEmoji: "⭐",
  useAllEmoji: true,
  minimumStarCount: 3,
};

class Starboard extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "starboard",
      description: "Configure the starboard for this server",
      usage: "/starboard  |  /starboard channel:#starboard emoji:⭐ minimum:3",
      enabled: true,
      guildOnly: true,
      permLevel: "Administrator",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .setDMPermission(false)
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel where starred messages are posted")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("emoji")
          .setDescription("Emoji that counts as a star")
          .setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName("use_all")
          .setDescription("Count all emoji reactions, not just the star emoji")
          .setRequired(false)
      )
      .addIntegerOption((option) =>
        option
          .setName("minimum")
          .setDescription("Minimum reactions needed to post a message")
          .setMinValue(1)
          .setRequired(false)
      );
  }

  formatSettings(starboardData) {
    const lines = [
      `channel${" ".repeat(13)}::  ${starboardData.starboardChannel ? starboardData.starboardChannel : ""}`,
      `emoji${" ".repeat(15)}::  ${starboardData.starEmoji}`,
      `use_all${" ".repeat(13)}::  ${starboardData.useAllEmoji}`,
      `minimum${" ".repeat(13)}::  ${starboardData.minimumStarCount}`,
    ];
    return `\`\`\`asciidoc\n= Current Starboard Settings =\n${lines.join("\n")}\`\`\``;
  }

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        await interaction.reply({
          content: "This command can only be used in a server.",
          ephemeral: true,
        });
        return;
      }

      const channel = interaction.options.getChannel("channel");
      const emoji = interaction.options.getString("emoji");
      const useAll = interaction.options.getBoolean("use_all");
      const minimum = interaction.options.getInteger("minimum");

      const starboardData = Object.assign(
        {},
        EmptyStarboardData,
        this.client.getGameData(interaction.guild, "STARBOARD")
      );

      const hasUpdates =
        channel != null || emoji != null || useAll != null || minimum != null;

      if (!hasUpdates) {
        await interaction.reply({
          content: this.formatSettings(starboardData),
          ephemeral: true,
        });
        return;
      }

      const errors = [];
      const changes = [];

      if (channel != null) {
        const perms = channel.permissionsFor
          ? channel.permissionsFor(this.client.user)
          : null;
        if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) {
          errors.push("I can't find or post in that channel");
        } else if (
          starboardData.starboardChannelId !== channel.id ||
          starboardData.starboardChannel !== channel.name
        ) {
          changes.push(
            `channel: ${starboardData.starboardChannel || "(unset)"} → ${channel.name}`
          );
          starboardData.starboardChannel = channel.name;
          starboardData.starboardChannelId = channel.id;
        }
      }

      if (emoji != null) {
        const trimmedEmoji = emoji.trim();
        if (!trimmedEmoji) {
          errors.push("Emoji cannot be empty");
        } else if (starboardData.starEmoji !== trimmedEmoji) {
          changes.push(`emoji: ${starboardData.starEmoji} → ${trimmedEmoji}`);
          starboardData.starEmoji = trimmedEmoji;
        }
      }

      if (useAll != null && starboardData.useAllEmoji !== useAll) {
        changes.push(`use_all: ${starboardData.useAllEmoji} → ${useAll}`);
        starboardData.useAllEmoji = useAll;
      }

      if (minimum != null) {
        if (!Number.isInteger(minimum) || minimum < 1) {
          errors.push("Minimum must be a positive integer");
        } else if (starboardData.minimumStarCount !== minimum) {
          changes.push(
            `minimum: ${starboardData.minimumStarCount} → ${minimum}`
          );
          starboardData.minimumStarCount = minimum;
        }
      }

      if (errors.length) {
        await interaction.reply({
          content: errors.join("\n"),
          ephemeral: true,
        });
        return;
      }

      if (changes.length) {
        this.client.setGameData(interaction.guild, "STARBOARD", starboardData);
      }

      const summary =
        changes.length > 0
          ? `Updated starboard settings:\n${changes.join("\n")}`
          : "No changes — values already match current settings.";

      await interaction.reply({
        content: `${summary}\n\n${this.formatSettings(starboardData)}`,
        ephemeral: true,
      });
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }
}

module.exports = Starboard;
