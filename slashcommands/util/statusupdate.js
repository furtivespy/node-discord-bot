import SlashCommand from "../../base/SlashCommand.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionsBitField, MessageFlags } from "discord.js";
import {
  applyBotActivity,
  isStreamingUrl,
  parseStatusUpdateType,
  STATUS_UPDATE_CHOICES,
} from "../../modules/botActivity.js";

class StatusUpdate extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "statusupdate",
      description: "Bot owner: set the bot's activity shown in the member list",
      usage: "/statusupdate type:Playing activity:QA test",
      category: "admin",
      enabled: true,
      hidden: true,
      permLevel: "Bot Owner",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("Activity type Discord shows before the text")
          .setRequired(true)
          .addChoices(...STATUS_UPDATE_CHOICES)
      )
      .addStringOption((option) =>
        option
          .setName("activity")
          .setDescription("Text that follows the type")
          .setRequired(true)
          .setMaxLength(128)
      )
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription("Required for Streaming: a Twitch or YouTube URL")
          .setRequired(false)
      );
  }

  isBotOwner(userId) {
    return Boolean(this.client.config.botOwnerId) && this.client.config.botOwnerId === userId;
  }

  async execute(interaction) {
    try {
      if (!this.isBotOwner(interaction.user.id)) {
        await interaction.reply({
          content: "This command is only for the bot owner.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const activityType = parseStatusUpdateType(interaction.options.getString("type", true));
      if (!activityType) {
        await interaction.reply({
          content: "That activity type is not supported.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const activity = (interaction.options.getString("activity", true) || "").trim();
      if (!activity) {
        await interaction.reply({
          content: "Activity text cannot be empty.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const url = (interaction.options.getString("url") || "").trim();
      if (activityType === "STREAMING") {
        if (!url) {
          await interaction.reply({
            content:
              "Streaming needs a Twitch or YouTube URL. Pass the url option, for example `url:https://twitch.tv/discord`.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (!isStreamingUrl(url)) {
          await interaction.reply({
            content: "Streaming URLs must be a Twitch or YouTube link.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      this.client.config.activity = activity;
      this.client.config.activityType = activityType;
      this.client.config.activityUrl = activityType === "STREAMING" ? url : "";

      applyBotActivity(this.client.user, activity, activityType, {
        url: activityType === "STREAMING" ? url : undefined,
      });

      const label = STATUS_UPDATE_CHOICES.find((choice) => choice.value === activityType)?.name
        || activityType;
      await interaction.reply({
        content:
          activityType === "STREAMING"
            ? `Status set to **${label}** ${activity} (${url}).`
            : `Status set to **${label}** ${activity}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      this.client.logger.log(e, "error");
      const payload = {
        content: "Something went wrong updating status.",
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
}

export default StatusUpdate;
