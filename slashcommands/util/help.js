const SlashCommand = require("../../base/SlashCommand.js");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const {
  CATEGORY_META,
  OVERVIEW_ID,
  viewerFromInteraction,
  resolveHelpView,
  selectOptions,
  listHelpCommands,
} = require("../../modules/helpCatalog.js");

const COLLECTOR_MS = 180_000;

class Help extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "help",
      description: "See what Bender can do",
      usage: "/help  |  /help command:wiki  |  /help category:Chat",
      category: "util",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("command")
          .setDescription("Details for one slash command")
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addStringOption((option) =>
        option
          .setName("category")
          .setDescription("Jump to a group of commands")
          .setRequired(false)
          .addChoices(
            { name: "Overview", value: OVERVIEW_ID },
            ...Object.values(CATEGORY_META)
              .sort((a, b) => a.order - b.order)
              .map((meta) => ({ name: meta.label, value: meta.id }))
          )
      );
  }

  helpPayload(interaction, { commandName, categoryId } = {}) {
    const viewer = viewerFromInteraction(interaction, this.client);
    const view = resolveHelpView(this.client.slashcommands, viewer, {
      commandName,
      categoryId,
    });
    const embed = new EmbedBuilder(view.embed);
    const options = selectOptions(view.commands, view.selectedId);
    const components = [];
    if (options.length > 1) {
      components.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("help:category")
            .setPlaceholder("Browse by category")
            .addOptions(options)
        )
      );
    }
    const payload = {
      embeds: [embed],
      components,
      ephemeral: true,
    };
    if (view.note) payload.content = view.note;
    return payload;
  }

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "command") {
      return interaction.respond([]);
    }
    const query = String(focused.value || "").toLowerCase();
    const viewer = viewerFromInteraction(interaction, this.client);
    const commands = listHelpCommands(this.client.slashcommands, viewer);
    const matches = commands
      .filter((cmd) => {
        if (!query) return true;
        return (
          cmd.help.name.includes(query) ||
          String(cmd.help.description || "")
            .toLowerCase()
            .includes(query)
        );
      })
      .slice(0, 25);
    await interaction.respond(
      matches.map((cmd) => {
        const label = `/${cmd.help.name} — ${cmd.help.description || ""}`;
        return {
          name: label.slice(0, 100),
          value: cmd.help.name,
        };
      })
    );
  }

  async execute(interaction) {
    try {
      const payload = this.helpPayload(interaction, {
        commandName: interaction.options.getString("command"),
        categoryId: interaction.options.getString("category"),
      });
      await interaction.reply(payload);
      if (!payload.components.length) return;

      const message = await interaction.fetchReply();
      const collector = message.createMessageComponentCollector({
        filter: (i) =>
          i.user.id === interaction.user.id && i.customId === "help:category",
        time: COLLECTOR_MS,
      });

      collector.on("collect", async (select) => {
        try {
          const next = this.helpPayload(interaction, {
            categoryId: select.values[0],
          });
          await select.update({
            content: next.content || null,
            embeds: next.embeds,
            components: next.components,
          });
        } catch (e) {
          this.client.logger.log(e, "error");
        }
      });

      collector.on("end", async () => {
        try {
          await interaction.editReply({ components: [] });
        } catch {
          // Interaction may already be gone; ignore.
        }
      });
    } catch (e) {
      this.client.logger.log(e, "error");
      const fallback = {
        content: "Something went wrong showing help. Try `/help` again.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(fallback).catch(() => {});
      } else {
        await interaction.reply(fallback).catch(() => {});
      }
    }
  }
}

module.exports = Help;
