const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const flip = require("flip");

class Flip extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "flip",
      description: "Flip a table or something",
      category: "Fun",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("toflip")
          .setDescription("If you want to flip something other than a table")
          .setRequired(false)
      );
  }

  async execute(interaction) {
    const toFlip = interaction.options.getString("toflip") || "┬─┬";
    await interaction.reply(`(╯°□°)╯    ]`);
    await interaction.followUp(`(╯°□°)╯ ︵ ${flip(toFlip)}`);
  }
}

module.exports = Flip;
