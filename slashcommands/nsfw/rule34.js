const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const fetch = require("node-fetch");
const _ = require("lodash");

class Rule34 extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "rule34",
      description: "Rule34",
      usage: "Use this command to get rule34",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("search")
          .setDescription("What shit has been rule 34'd?")
          .setRequired(true)
      )
      .setNSFW(true);
  }

  async execute(interaction) {
    try {
      interaction.deferReply();
      const search = interaction.options.getString("search");

      const searchParms = new URLSearchParams({
        page: "dapi",
        s: "post",
        q: "index",
        limit: 20,
        tags: search.replace(/ /g, "_"),
        json: 1,
      });

      let post = undefined;
      const response = await fetch(
        `https://rule34.xxx/index.php?${searchParms.toString()}`
      );
      try {
        const data = await response.json();
        post = _.sample(data);
      } catch (e) {
        return interaction.editReply("No results found.");
      }

      if (post === undefined || post.file_url === undefined) {
        return interaction.editReply("No results found.");
      }

      await interaction.editReply({
        embeds: [
          {
            title: search,
            url: post.file_url,
            color: 11273754,
            image: {
              url: post.file_url,
            },
            footer: {
              icon_url: interaction.user.displayAvatarURL(),
              text: `Requested by ${interaction.user.tag} | Powered by rule34.xxx`,
            },
          },
        ],
      });
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }
}

module.exports = Rule34;
