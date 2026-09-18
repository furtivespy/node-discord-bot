import SlashCommand from "../../base/SlashCommand.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionsBitField } from "discord.js";
import { isBotAdmin, splitDiscordMessages } from "../../modules/guildConfigOverview.js";
import { formatAllGuildsUsageText, formatGuildUsageText } from "../../modules/usagePulse.js";

function isGuildAdmin(interaction) {
  try {
    return Boolean(interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator));
  } catch {
    return false;
  }
}

function canViewUsage(client, interaction) {
  if (isBotAdmin(client, interaction.user?.id)) return true;
  return isGuildAdmin(interaction);
}

function guildNameById(client) {
  const map = {};
  for (const guild of client.guilds?.cache?.values?.() || []) {
    if (guild?.id && guild?.name) map[guild.id] = guild.name;
  }
  return map;
}

class Usage extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "usage",
      description: "Top slash commands on this server for the last 7 days",
      usage: "/usage  |  /usage all:True",
      category: "admin",
      enabled: true,
      permLevel: "Administrator",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .setDMPermission(false)
      .addBooleanOption((option) =>
        option
          .setName("all")
          .setDescription("Bot owner: roll up every joined server (names only, no user data)")
          .setRequired(false)
      );
  }

  async execute(interaction) {
    try {
      if (!canViewUsage(this.client, interaction)) {
        await interaction.reply({
          content: "This command is only for server admins.",
          ephemeral: true,
        });
        return;
      }

      if (!interaction.guild) {
        await interaction.reply({
          content: "Use this command in a server.",
          ephemeral: true,
        });
        return;
      }

      const pulse = this.client.usagePulse;
      if (!pulse) {
        await interaction.reply({
          content: "Usage pulse is not available on this process.",
          ephemeral: true,
        });
        return;
      }

      const wantAll = Boolean(interaction.options.getBoolean("all"));
      const owner = isBotAdmin(this.client, interaction.user?.id);
      if (wantAll && !owner) {
        await interaction.reply({
          content: "All-server rollup is only for the bot owner.",
          ephemeral: true,
        });
        return;
      }

      let report;
      if (wantAll && owner) {
        const rollup = pulse.allGuildsReport({ guildNameById: guildNameById(this.client) });
        report = formatAllGuildsUsageText(rollup.guilds, rollup);
      } else {
        const stats = pulse.guildReport(interaction.guild.id);
        report = formatGuildUsageText(stats, { guildName: interaction.guild.name });
      }

      const chunks = splitDiscordMessages(report);
      await interaction.reply({ content: chunks[0], ephemeral: true });
      for (const chunk of chunks.slice(1)) {
        await interaction.followUp({ content: chunk, ephemeral: true });
      }
    } catch (e) {
      this.client.logger.log(e, "error");
      const payload = {
        content: "Something went wrong reading usage.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
}

export default Usage;
export { canViewUsage };
