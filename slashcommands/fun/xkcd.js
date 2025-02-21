const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder, EmbedBuilder } = require("@discordjs/builders");
const fetch = require("node-fetch");

class Xkcd extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "xkcd",
      description: "xkcd comic",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addIntegerOption((option) =>
        option
          .setName("comic")
          .setDescription("The comic to get (id)")
          .setRequired(false)
      );
  }

  async execute(interaction) {
    await interaction.deferReply();
    const comic = interaction.options.getInteger("comic");
    const url = comic
      ? `https://xkcd.com/${comic}/info.0.json`
      : "https://xkcd.com/info.0.json";
    const res = await fetch(url);
    const data = await res.json();
    const embed = new EmbedBuilder()
      .setTitle(data.title)
      .setImage(data.img)
      .setURL(`https://xkcd.com/${data.num}`)
      .setFooter({ text: data.alt });

    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = Xkcd;
