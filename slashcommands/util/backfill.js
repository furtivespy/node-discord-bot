const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const { PRIORITIZE_CHANNEL_TYPES } = require("../../modules/chatBackfill.js");

class Backfill extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "backfill",
      description: "Control Discord history crawl for chat memory",
      usage: "/backfill status",
      category: "chat",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addSubcommand((subcommand) =>
        subcommand.setName("status").setDescription("Show backfill progress for this server")
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("start").setDescription("Start crawling this server's channel history")
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("pause").setDescription("Pause the history crawl after the current page")
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("resume").setDescription("Resume a paused history crawl")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("prioritize")
          .setDescription("Crawl this channel next")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Channel to crawl next")
              .addChannelTypes(...PRIORITIZE_CHANNEL_TYPES)
              .setRequired(true)
          )
      );
  }

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        await interaction.reply({ content: "Use this command in a server.", ephemeral: true });
        return;
      }

      switch (interaction.options.getSubcommand()) {
        case "status":
          await this.status(interaction);
          break;
        case "start":
          await this.start(interaction);
          break;
        case "pause":
          await this.pause(interaction);
          break;
        case "resume":
          await this.resume(interaction);
          break;
        case "prioritize":
          await this.prioritize(interaction);
          break;
        default:
          await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
      }
    } catch (e) {
      this.client.logger.log(e, "error");
      const payload = { content: "Something went wrong with that backfill command.", ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }

  async status(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const db = this.client.getDatabase(interaction.guild.id);
    const worker = db.getBackfillWorker();
    const summary = db.getBackfillSummary();
    const transcripts = db.getTranscriptSummary();
    const current = db.getRunningBackfill();
    const discovering = db.getDiscoveringBackfill();

    const lines = [
      `Worker: **${worker.status}**`,
      `Pace: crawl → monthly transcript files → File Search upload. Watching refreshes current-month weeklies about once a day.`,
    ];

    if (worker.priority_channel_id) {
      lines.push(`Priority: <#${worker.priority_channel_id}>`);
    }

    if (!summary || summary.queued === 0) {
      lines.push("Nothing queued yet. Use `/backfill start` to begin.");
    } else {
      lines.push(
        `Queued: **${summary.channels}** channels/forums, **${summary.threads}** threads (${summary.queued} total)`
      );
      lines.push(
        `Messages stored: **${summary.messages}**  ·  pending ${summary.pending}  ·  in progress ${summary.in_progress}  ·  caught up ${summary.caught_up}  ·  skipped ${summary.skipped}  ·  error ${summary.error}`
      );
    }

    if (current) {
      lines.push(this.formatJobLine("Currently", current, db, current.status === "discovering"));
    }
    if (discovering && discovering.channel_id !== current?.channel_id) {
      lines.push(this.formatJobLine("Discovering", discovering, db, true));
    }

    if (transcripts) {
      lines.push(
        `Transcripts: **${transcripts.months}** monthly files, **${transcripts.weeks}** current-month weeklies, **${transcripts.uploaded || 0}** uploaded to File Search`
      );
    }
    if (worker.file_search_store) {
      lines.push(`File Search: store ready`);
    } else {
      lines.push(`File Search: store not created yet`);
    }
    if (worker.last_tick_at) {
      lines.push(`Last watch tick: ${new Date(worker.last_tick_at).toISOString()}`);
    }
    if (worker.last_upload_error) {
      lines.push(`Upload error: ${worker.last_upload_error}`);
    }
    if (worker.upload_period_key) {
      const mention = worker.upload_channel_id ? `<#${worker.upload_channel_id}>` : "a channel";
      lines.push(`Uploading: ${mention} — ${worker.upload_period_type || "file"} ${worker.upload_period_key}`);
    }
    if (worker.compile_period_key) {
      const mention = worker.compile_channel_id ? `<#${worker.compile_channel_id}>` : "a channel";
      lines.push(
        `Compiling: ${mention} — ${worker.compile_period_type || "file"} ${worker.compile_period_key}`
      );
    }

    await interaction.editReply({ content: lines.join("\n") });
  }

  formatJobLine(label, row, db, discovering) {
    const kind = row.kind === "thread" ? "thread" : row.kind === "forum" ? "forum" : "channel";
    if (discovering) {
      const stage = row.thread_archive_kind || "public";
      return `${label}: <#${row.channel_id}> (${kind}) — listing ${stage} archived threads`;
    }
    const oldest = db.getChatMessageCreatedAt(row.oldest_id_seen);
    const oldestLabel = oldest ? new Date(oldest).toISOString().slice(0, 10) : "—";
    const err = row.last_error ? `  error: ${row.last_error}` : "";
    return `${label}: <#${row.channel_id}> (${kind}) — ${row.status} — ${row.messages_stored} stored — oldest ${oldestLabel}${err}`;
  }

  async start(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await this.client.chatBackfill.startGuild(interaction.guild);
    await interaction.editReply({
      content:
        "Backfill is running. After crawl it writes transcript files, creates a File Search store if needed, and uploads history. Then it watches daily for current-month weekly updates. Skip-list and NSFW channels are not crawled or indexed. Use `/backfill status` to watch, `/backfill pause` to stop.",
    });
  }

  async pause(interaction) {
    this.client.chatBackfill.pauseGuild(interaction.guild);
    await interaction.reply({
      content: "Backfill and File Search watching will pause after the current page. Progress is saved.",
      ephemeral: true,
    });
  }

  async resume(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await this.client.chatBackfill.resumeGuild(interaction.guild);
    await interaction.editReply({ content: "Backfill resumed." });
  }

  async prioritize(interaction) {
    const channel = interaction.options.getChannel("channel", true);
    const reason = this.client.chatBackfill.channelSkipReason(interaction.guild, channel);
    if (reason) {
      await interaction.reply({
        content: `Cannot crawl ${channel}: ${reason}.`,
        ephemeral: true,
      });
      return;
    }

    const result = this.client.chatBackfill.prioritize(interaction.guild, channel);
    await interaction.reply({
      content: result.message || `${channel} will be crawled next. Start or resume backfill if it is paused.`,
      ephemeral: true,
    });
  }
}

module.exports = Backfill;
