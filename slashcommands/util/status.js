import SlashCommand from "../../base/SlashCommand.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import { EmbedBuilder, PermissionsBitField } from "discord.js";
import {
  canViewHealth,
  collectAllGuildHealth,
  collectGuildHealth,
  formatAllGuildsHealth,
  formatHealthDescription,
  healthEmbedColor,
  isBotAdmin,
  splitDiscordMessages,
} from "../../modules/guildHealth.js";

class Status extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "status",
      description: "Admin: green/yellow/red health (commands, pack refresh, image-gen)",
      usage: "/status  |  /status all:True",
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
          .setDescription("Bot owner: health for every joined server")
          .setRequired(false)
      );
  }

  async execute(interaction) {
    try {
      if (!canViewHealth(this.client, interaction)) {
        await interaction.reply({
          content: "This health check is only for server administrators.",
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

      const wantAll = Boolean(interaction.options.getBoolean("all"));
      if (wantAll) {
        if (!isBotAdmin(this.client, interaction.user.id)) {
          await interaction.reply({
            content: "Showing every server is only for the bot owner or configured admin IDs.",
            ephemeral: true,
          });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        try {
          await this.client.guilds.fetch();
        } catch (e) {
          this.client.logger.log(
            `status: guilds.fetch failed, using cache (${this.client.guilds.cache.size} guilds): ${e}`,
            "warn"
          );
        }
        const snapshots = collectAllGuildHealth(this.client, this.client.guilds.cache.values());
        const shared = collectGuildHealth(this.client, interaction.guild);
        const chunks = splitDiscordMessages(formatAllGuildsHealth(snapshots, shared));
        await interaction.editReply({ content: chunks[0] });
        for (const chunk of chunks.slice(1)) {
          await interaction.followUp({ content: chunk, ephemeral: true });
        }
        return;
      }

      const snapshot = collectGuildHealth(this.client, interaction.guild);
      const embed = new EmbedBuilder()
        .setColor(healthEmbedColor(snapshot.health))
        .setDescription(formatHealthDescription(snapshot).slice(0, 4096))
        .setFooter({ text: "Ephemeral · admins only · no secrets" });
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
      this.client.logger.log(e, "error");
      const payload = {
        content: "Something went wrong reading health.",
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

export default Status;
export { canViewHealth };
