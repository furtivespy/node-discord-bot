const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const fetch = require("node-fetch");

class Butts extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "butts",
      description: "Butts",
      usage: "Use this command to get butts",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .setNSFW(true);
  }

  async execute(interaction) {
    try {
      interaction.deferReply();

      fetch("http://api.obutts.ru/butts/0/1/random")
        .then((res) => res.json())
        .then(async (body) => {
          await interaction.editReply({
            embeds: [
              {
                title: "Click here if the image failed to load.",
                url: `http://media.obutts.ru/${body[0].preview}`,
                color: 11273754,
                image: {
                  url: `http://media.obutts.ru/${body[0].preview}`,
                },
                footer: {
                  icon_url: interaction.user.displayAvatarURL(),
                  text: `Requested by ${interaction.user.tag} | Powered by obutts.ru`,
                },
              },
            ],
          });
        });
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }
}

module.exports = Butts;
