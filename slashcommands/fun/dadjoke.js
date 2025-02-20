const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const fetch = require("node-fetch");

class DadJoke extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "dadjoke",
      description: "Tells a dad joke.",
      category: "Fun",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description);
  }

  async execute(interaction) {
    await interaction.deferReply();

    fetch("https://icanhazdadjoke.com/", { headers: { Accept: "text/plain" } })
      .then((res) => res.text())
      .then((text) => {
        const embed = {
          author: {
            name: `${
              interaction.guild.members.cache.get(this.client.user.id)
                .displayName
            }'s Dad Says:`,
            icon_url: "https://i.imgur.com/W3WseeN.png",
          },
          description: `_${text}_`,
          color: 6192321,
        };
        interaction.editReply({ embeds: [embed] });
      });
  }
}

module.exports = DadJoke;
