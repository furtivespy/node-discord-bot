const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const fetch = require("node-fetch");

class Slogan extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "slogan",
      description: "Come up with a cool slogan",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("item")
          .setDescription("The item to create a slogan for")
          .setRequired(true)
      );
  }

  async execute(interaction) {
    await interaction.deferReply();
    const item = new URLSearchParams({
      slogan: interaction.options.getString("item"),
    });
    const response = await fetch(
      `http://www.sloganizer.net/en/outbound.php?${item}`
    );
    const data = await response.text();
    await interaction.editReply(data.replace(/<.*?>/g, ""));
  }
}

module.exports = Slogan;
