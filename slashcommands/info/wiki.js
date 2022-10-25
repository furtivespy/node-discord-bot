const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("discord.js");
const fetch = require("node-fetch");
const wtf = require("wtf_wikipedia");
const SampleSize = require("lodash/sampleSize");
const { isNull } = require("lodash");

class Wiki extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "wiki",
      description: "Look up a wikipedia article",
      usage: "Use this command to find a wikipedia article",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("page")
          .setDescription("The wiki page to find")
          .setAutocomplete(true)
          .setRequired(true)
      );
  }

  async execute(interaction) {
    try {
      const search = interaction.options.getString("page");
      if (interaction.isAutocomplete()) {
        if (!search) {
          await interaction.respond([]);
          return;
        }
        let query = new URLSearchParams();
        query.set("action", "opensearch");
        query.set("format", "json");
        query.set("limit", 10);
        query.set("search", search);
        fetch(`https://en.wikipedia.org/w/api.php?${query.toString()}`)
          .then((res) => res.json())
          .then(async (searchResults) => {
            await interaction.respond(
              searchResults[1].map((result) => ({
                name: result,
                value: result,
              }))
            );
          });
      } else {
        wtf.extend(require("wtf-plugin-markdown"));
        wtf.fetch(search).then((doc) => {
          if (!doc) {
            interaction.reply({
              content: `Unable to find a wikipedia page with the title of '${search}'`,
              ephemeral: true,
            });
          } else if (doc.isDisambiguation()) {
            let somelinks = SampleSize(doc.links(), 10);
            let links = "";
            somelinks.forEach((item) => {
              links += `\n * ${item.page()}`;
            });
            interaction.reply({
              content: `[${search}](${doc.url()}) is a disambiguation page.\nPerhaps you meant to be more specific with "(film)" or "(album)"?)\n\n**Here are some articles associated with your search:** ${links}`,
              ephemeral: true,
            });
          } else {
            let description = doc.section(0).markdown();
            description = description.replace(
              /(\(.\/)/gm,
              "(https://en.wikipedia.org/wiki/"
            );
            interaction.reply({
              embeds: [
                {
                  author: { name: doc.title(), url: doc.url() },
                  description: description.substring(0, 2040),
                  color: 13749966,
                  thumbnail: {
                    url: doc.images()[0] ? doc.images()[0].url() : "",
                  },
                },
              ],
            });
          }
        });
      }
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }
}

module.exports = Wiki;
