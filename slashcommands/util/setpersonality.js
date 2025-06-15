const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const { PermissionsBitField } = require("discord.js");

const personalityChoices = [
  { name: "Bender (Default)", value: "bender" },
  { name: "Hardboiled AI Detective", value: "detective" },
  { name: "Zen Master (New Jersey)", value: "zenmaster_nj" },
  { name: "Grumpy Dwarven Craftsman", value: "dwarf_craftsman" },
  { name: "Ship's Computer", value: "ship_computer" },
  { name: "Enthusiastic Educator", value: "educator_joy" },
  { name: "Reluctant Oracle", value: "oracle_sigh" },
  { name: "Shakespearean Actor", value: "shakespeare" },
  { name: "Pirate Quartermaster", value: "pirate_qm" },
  { name: "Anxious Philosopher", value: "anxious_philosopher" },
  { name: "The Chicago Pope", value: "chicago_pope" },
];

class SetPersonality extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "setpersonality",
      description: "Manage the bot's AI personality.",
      guildOnly: true,
      permLevel: "Administrator", // For help system, actual check is below
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addSubcommand((option) =>
        option
          .setName("set")
          .setDescription("Set the AI's personality for this server.")
          .addStringOption((input) =>
            input
              .setName("personality")
              .setDescription("Choose the desired personality.")
              .setRequired(true)
              .addChoices(...personalityChoices) // Spread operator for choices
          )
      )
      .addSubcommand((option) =>
        option
          .setName("view")
          .setDescription("View the current AI personality setting.")
      )
      .addSubcommand((option) =>
        option
          .setName("reset")
          .setDescription("Reset the AI personality to the default (Bender).")
      );
  }

  async execute(interaction) {
    if (!interaction.guild) {
        await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return;
    }

    // Double check permissions, though setDefaultMemberPermissions should handle most cases
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: "You need Administrator permissions to use this command.", ephemeral: true});
        return;
    }

    try {
      const subcommand = interaction.options.getSubcommand();
      switch (subcommand) {
        case "set":
          await this.set(interaction);
          break;
        case "view":
          await this.view(interaction);
          break;
        case "reset":
          await this.reset(interaction);
          break;
        default:
          await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
      }
    } catch (e) {
      this.client.logger.error(`Error in /setpersonality: ${e.stack || e}`);
      await interaction.reply({ content: "An error occurred while processing your command.", ephemeral: true }).catch(err => this.client.logger.error(`Failed to send error reply: ${err}`));
    }
  }

  async set(interaction) {
    const chosenPersonalityKey = interaction.options.getString("personality");

    if (!this.client.settings.has(interaction.guild.id)) {
      this.client.settings.set(interaction.guild.id, {});
    }
    this.client.settings.set(interaction.guild.id, chosenPersonalityKey, "ai_selected_personality");

    const chosenPersonality = personalityChoices.find(p => p.value === chosenPersonalityKey);
    await interaction.reply({
      content: `AI personality set to: **${chosenPersonality ? chosenPersonality.name : chosenPersonalityKey}**.`,
    });
  }

  async view(interaction) {
    const settings = this.client.getSettings(interaction.guild); // Ensure settings are for the guild
    const currentKey = settings.ai_selected_personality || "bender"; // Default to bender if not set

    const currentPersonality = personalityChoices.find(p => p.value === currentKey);
    const personalityName = currentPersonality ? currentPersonality.name : "Unknown (defaulting to Bender)";

    await interaction.reply({
      content: `The current AI personality is: **${personalityName}**.`,
      ephemeral: true,
    });
  }

  async reset(interaction) {
    const settings = this.client.getSettings(interaction.guild);

    if (settings.ai_selected_personality) {
      this.client.settings.delete(interaction.guild.id, "ai_selected_personality");
      await interaction.reply({
        content: "AI personality has been reset to default (Bender).",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "AI personality is already using the default (Bender). No changes made.",
        ephemeral: true,
      });
    }
  }
}

module.exports = SetPersonality;
