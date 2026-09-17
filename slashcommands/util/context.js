import SlashCommand from "../../base/SlashCommand.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import {
  PACK_KINDS,
  MAX_PACKS_PER_GUILD,
  redactUrl,
  listGuildPacks,
  upsertGuildPack,
  removeGuildPack,
  validatePackName,
  persistGuildPackStatus,
  toPersistedStatus,
} from "../../modules/contextPacks.js";
import {
  canViewContextDashboard,
  collectGuildFreshness,
  formatAllGuildsFreshness,
  formatFetchResult,
  formatFreshnessDashboard,
  freshnessEmbedColor,
  parseRefreshCustomId,
  refreshCustomId,
  splitDiscordMessages,
} from "../../modules/contextPackFreshness.js";
import { isBotAdmin } from "../../modules/guildConfigOverview.js";

const REFRESH_COLLECTOR_MS = 120_000;

function liveFetchOk(fetched) {
  if (!fetched) return false;
  if (fetched.serving_stale) return false;
  if (fetched.last_result) return fetched.last_result === "ok";
  return Boolean(fetched.ok);
}

class Context extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "context",
      description: "Configure per-server CSV context packs for chat",
      usage: "/context add url:https://… name:plays",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("add")
          .setDescription("Register a published CSV/context URL for this server")
          .addStringOption((option) =>
            option
              .setName("url")
              .setDescription("Published https CSV/text URL (treated as a secret)")
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Short pack name (default: plays)")
              .setRequired(false)
          )
          .addStringOption((option) =>
            option
              .setName("kind")
              .setDescription("When to attach this pack (default: plays)")
              .setRequired(false)
              .addChoices(
                { name: "Play tracker (games/stats questions)", value: "plays" },
                { name: "General notes (house rules / named pack)", value: "general" }
              )
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("list").setDescription("List this server's context packs (URLs hidden)")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("remove")
          .setDescription("Remove a context pack")
          .addStringOption((option) =>
            option.setName("name").setDescription("Pack name to remove").setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("refresh")
          .setDescription("Re-download a pack now and show fetch result + row count")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Pack name (omit to refresh all)")
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("status")
          .setDescription("Admin: freshness dashboard (last fetch, rows, errors)")
          .addBooleanOption((option) =>
            option
              .setName("all")
              .setDescription("Bot owner: show every joined server")
              .setRequired(false)
          )
      );
  }

  packs(interaction) {
    return listGuildPacks(this.client.getSettings(interaction.guild));
  }

  savePacks(interaction, packs) {
    if (!this.client.settings.has(interaction.guild.id)) {
      this.client.settings.set(interaction.guild.id, {});
    }
    this.client.settings.set(interaction.guild.id, packs, "context_packs");
  }

  packService() {
    return this.client.geminiAI?.contextPacks;
  }

  rememberFetch(guildId, packName, fetched) {
    persistGuildPackStatus(this.client, guildId, packName, toPersistedStatus(fetched));
  }

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        await interaction.reply({ content: "Use this command in a server.", ephemeral: true });
        return;
      }

      switch (interaction.options.getSubcommand()) {
        case "add":
          await this.add(interaction);
          break;
        case "list":
          await this.list(interaction);
          break;
        case "remove":
          await this.remove(interaction);
          break;
        case "refresh":
          await this.refresh(interaction);
          break;
        case "status":
          await this.status(interaction);
          break;
        default:
          await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
      }
    } catch (e) {
      this.client.logger.log(e?.message || String(e), "error");
      const payload = {
        content: "Something went wrong with that context command.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }

  async add(interaction) {
    const result = upsertGuildPack(this.packs(interaction), {
      name: interaction.options.getString("name") || "plays",
      kind: interaction.options.getString("kind") || "plays",
      url: interaction.options.getString("url", true),
    });
    if (result.error) {
      await interaction.reply({ content: result.error, ephemeral: true });
      return;
    }

    this.savePacks(interaction, result.packs);
    this.packService()?.invalidate(result.pack.url);

    const fetched = await this.packService()?.fetchUrl(result.pack.url, { force: true });
    if (fetched) this.rememberFetch(interaction.guild.id, result.pack.name, fetched);
    const check = liveFetchOk(fetched)
      ? `Reachable (${fetched.last_row_count ?? "?"} rows, ${fetched.bytes} bytes). Chat will attach it on matching questions.`
      : "Saved, but the fetch did not succeed just now. Chat will retry when a matching question comes in.";

    await interaction.reply({
      content: [
        result.replaced
          ? `Updated context pack \`${result.pack.name}\` (${result.pack.kind}).`
          : `Added context pack \`${result.pack.name}\` (${result.pack.kind}).`,
        `URL stored as ${redactUrl(result.pack.url)} — the full URL is not shown here and should not be pasted in public channels.`,
        check,
      ].join("\n"),
      ephemeral: true,
    });
  }

  async list(interaction) {
    const packs = this.packs(interaction);
    if (packs.length === 0) {
      await interaction.reply({
        content:
          "No context packs on this server yet. Publish a sheet as CSV, then `/context add url:<published-csv>`. See CONTEXT_PACKS.md.",
        ephemeral: true,
      });
      return;
    }

    const lines = packs.map((pack) => `- \`${pack.name}\` (${pack.kind}) — ${redactUrl(pack.url)}`);
    await interaction.reply({
      content: [
        `Context packs (${packs.length}/${MAX_PACKS_PER_GUILD}):`,
        lines.join("\n"),
        `Kinds: ${PACK_KINDS.join(", ")}.`,
        "Admins: `/context status` for last fetch / rows / URL / errors.",
      ].join("\n"),
      ephemeral: true,
    });
  }

  async remove(interaction) {
    const packs = this.packs(interaction);
    const result = removeGuildPack(packs, interaction.options.getString("name", true));
    if (result.error) {
      await interaction.reply({ content: result.error, ephemeral: true });
      return;
    }
    const removed = packs.find((pack) => pack.name === result.name);
    this.savePacks(interaction, result.packs);
    if (removed?.url) this.packService()?.invalidate(removed.url);
    await interaction.reply({
      content: `Removed context pack \`${result.name}\`.`,
      ephemeral: true,
    });
  }

  describeRefresh(pack, fetched) {
    if (!fetched) {
      return `\`${pack.name}\`: context pack service is not available.`;
    }
    if (liveFetchOk(fetched)) {
      const rows = fetched.last_row_count == null ? "?" : fetched.last_row_count;
      return `\`${pack.name}\`: ok — ${rows} rows (${fetched.bytes} bytes).`;
    }
    const detail = fetched.last_error || fetched.error || "unknown error";
    const stale = fetched.serving_stale ? " Last good copy is still in cache." : "";
    return `\`${pack.name}\`: ${formatFetchResult(fetched.last_result, fetched.last_error || fetched.error)} — ${detail}.${stale}`;
  }

  async refreshPacks(guildId, packs) {
    const service = this.packService();
    const lines = [];
    for (const pack of packs) {
      const fetched = await service?.fetchUrl(pack.url, { force: true });
      if (fetched) this.rememberFetch(guildId, pack.name, fetched);
      lines.push(this.describeRefresh(pack, fetched));
    }
    return lines;
  }

  async refresh(interaction) {
    const rawName = interaction.options.getString("name");
    const packs = this.packs(interaction);
    if (packs.length === 0) {
      await interaction.reply({
        content: "No context packs to refresh.",
        ephemeral: true,
      });
      return;
    }

    let selected = packs;
    if (rawName) {
      const named = validatePackName(rawName);
      if (named.error) {
        await interaction.reply({ content: named.error, ephemeral: true });
        return;
      }
      const pack = packs.find((item) => item.name === named.name);
      if (!pack) {
        await interaction.reply({
          content: `No context pack named \`${named.name}\`.`,
          ephemeral: true,
        });
        return;
      }
      selected = [pack];
    }

    await interaction.deferReply({ ephemeral: true });
    const lines = await this.refreshPacks(interaction.guild.id, selected);
    await interaction.editReply({
      content: rawName
        ? lines.join("\n")
        : `Refreshed ${packs.length} pack(s) now:\n${lines.join("\n")}`,
    });
  }

  statusSnapshot(guild) {
    return collectGuildFreshness(this.client, guild, this.packService());
  }

  statusPayload(snapshot, { allowRefresh = true } = {}) {
    const description = formatFreshnessDashboard(snapshot).slice(0, 4096);
    const embed = new EmbedBuilder()
      .setColor(freshnessEmbedColor(snapshot.health))
      .setDescription(description)
      .setFooter({ text: "Ephemeral · admins only" });

    const components = [];
    if (allowRefresh && !snapshot.missing && snapshot.packs.length) {
      const buttons = [
        new ButtonBuilder()
          .setCustomId(refreshCustomId("all"))
          .setLabel("Refresh now")
          .setStyle(ButtonStyle.Primary),
        ...snapshot.packs
          .filter((pack) => pack.name !== "all")
          .slice(0, 4)
          .map((pack) =>
            new ButtonBuilder()
              .setCustomId(refreshCustomId(pack.name))
              .setLabel(`Refresh ${pack.name}`.slice(0, 80))
              .setStyle(ButtonStyle.Secondary)
          ),
      ];
      for (let i = 0; i < buttons.length; i += 5) {
        components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }
    }

    return {
      embeds: [embed],
      components,
      ephemeral: true,
    };
  }

  async status(interaction) {
    if (!canViewContextDashboard(this.client, interaction)) {
      await interaction.reply({
        content: "This freshness dashboard is only for server administrators.",
        ephemeral: true,
      });
      return;
    }

    const showAll = Boolean(interaction.options.getBoolean("all"));
    if (showAll) {
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
          `context status: guilds.fetch failed, using cache (${this.client.guilds.cache.size} guilds): ${e}`,
          "warn"
        );
      }
      const snapshots = [...this.client.guilds.cache.values()]
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
        .map((guild) => this.statusSnapshot(guild));
      const chunks = splitDiscordMessages(formatAllGuildsFreshness(snapshots));
      await interaction.editReply({ content: chunks[0] });
      for (const chunk of chunks.slice(1)) {
        await interaction.followUp({ content: chunk, ephemeral: true });
      }
      return;
    }

    const payload = this.statusPayload(this.statusSnapshot(interaction.guild));
    await interaction.reply(payload);
    await this.collectRefreshClicks(interaction, payload);
  }

  async collectRefreshClicks(interaction, payload) {
    if (!payload.components?.length) return;
    const message =
      typeof interaction.fetchReply === "function" ? await interaction.fetchReply() : null;
    if (typeof message?.createMessageComponentCollector !== "function") return;

    const collector = message.createMessageComponentCollector({
      filter: (click) =>
        click.user.id === interaction.user.id && Boolean(parseRefreshCustomId(click.customId)),
      time: REFRESH_COLLECTOR_MS,
    });

    collector.on("collect", async (click) => {
      try {
        if (!canViewContextDashboard(this.client, click)) {
          await click.reply({
            content: "This freshness dashboard is only for server administrators.",
            ephemeral: true,
          });
          return;
        }
        await click.deferUpdate();
        const target = parseRefreshCustomId(click.customId);
        const packs = this.packs(interaction);
        const selected =
          target === "all" ? packs : packs.filter((pack) => pack.name === target);
        if (selected.length === 0) {
          await interaction.editReply({
            content: target === "all" ? "No context packs to refresh." : `No context pack named \`${target}\`.`,
            embeds: [],
            components: [],
          });
          return;
        }
        await this.refreshPacks(interaction.guild.id, selected);
        const next = this.statusPayload(this.statusSnapshot(interaction.guild));
        await interaction.editReply(next);
      } catch (e) {
        this.client.logger.log(e?.message || String(e), "error");
      }
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // Interaction may already be gone; ignore.
      }
    });
  }
}

export default Context;
