const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const fetch = require("node-fetch");

class Chuck extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "chuck",
      description: "Chuck Norris",
      usage: "Get's a random Chuck Norris fact",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to get a fact about")
          .setRequired(false)
      );
  }

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const user = interaction.options.getUser("user");
      let url = null;
      if (user) {
        const nameQuery = new URLSearchParams({
          name: `<@${user.id}>`,
        });
        url = `https://api.chucknorris.io/jokes/random?${nameQuery.toString()}`;
      } else {
        url = `https://api.chucknorris.io/jokes/random`;
      }

      const response = await fetch(url);
      const data = await response.json();

      await interaction.editReply(data.value);
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }
}

module.exports = Chuck;
