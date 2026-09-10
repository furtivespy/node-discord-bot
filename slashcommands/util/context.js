import SlashCommand from "../../base/SlashCommand.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import {
  PACK_KINDS,
  MAX_PACKS_PER_GUILD,
  redactUrl,
  listGuildPacks,
  upsertGuildPack,
  removeGuildPack,
  validatePackName,
} from "../../modules/contextPacks.js";

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
          .setDescription("Clear the short fetch cache so the next games question re-downloads")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Pack name (omit to refresh all)")
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
    this.client.geminiAI?.contextPacks?.invalidate(result.pack.url);

    const fetched = await this.client.geminiAI?.contextPacks?.fetchUrl(result.pack.url);
    const check = fetched?.ok
      ? `Reachable (${fetched.bytes} bytes). Chat will attach it on matching questions.`
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
      content: `Context packs (${packs.length}/${MAX_PACKS_PER_GUILD}):\n${lines.join("\n")}\nKinds: ${PACK_KINDS.join(", ")}.`,
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
    if (removed?.url) this.client.geminiAI?.contextPacks?.invalidate(removed.url);
    await interaction.reply({
      content: `Removed context pack \`${result.name}\`.`,
      ephemeral: true,
    });
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

    if (!rawName) {
      for (const pack of packs) this.client.geminiAI?.contextPacks?.invalidate(pack.url);
      await interaction.reply({
        content: `Cleared the fetch cache for ${packs.length} pack(s). The next matching chat will download again.`,
        ephemeral: true,
      });
      return;
    }

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
    this.client.geminiAI?.contextPacks?.invalidate(pack.url);
    await interaction.reply({
      content: `Cleared the fetch cache for \`${pack.name}\`.`,
      ephemeral: true,
    });
  }
}

export default Context;
