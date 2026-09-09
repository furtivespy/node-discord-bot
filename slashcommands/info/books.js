import SlashCommand from "../../base/SlashCommand.js";

import { SlashCommandBuilder } from "discord.js";

import {GetBookEmbed} from '../../modules/openLibrary.js';
class Books extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "book",
      description: "Look up a book on Open Library",
      usage: "Use this command to find a book",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("book")
          .setDescription("Book info to search for")
          .setRequired(true)
      )
  }

  async execute(interaction) {
  //try {
    let search = interaction.options.getString("book");
    
      await interaction.deferReply();

      let bookEmbed = await GetBookEmbed(search)

      await interaction.editReply({
        embeds: [bookEmbed],
      });
    
  // } catch (e) {
  //   this.client.logger.log(e, "error");
  //}
  }
}

export default Books;
