import SlashCommand from "../../base/SlashCommand.js";

import { SlashCommandBuilder } from "discord.js";

import BoardGameGeek from '../../modules/boardgamegeek.js';
class BGG extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "bgg",
      description: "Look up a game on Board Game Geek",
      usage: "Use this command to find a game",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("game")
          .setDescription("The game to find")
          .setAutocomplete(true)
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("details")
          .setDescription("Amount of details to show")
          .addChoices(
            {name: "All Details (default)", value: BoardGameGeek.DetailsEnum.ALL},
            {name: "Only Description", value: BoardGameGeek.DetailsEnum.BASIC},
            {name: "Only Awards", value: BoardGameGeek.DetailsEnum.AWARDS},
            {name: "All Details (Ephemeral)", value: BoardGameGeek.DetailsEnum.ALLEPHEMERAL},
          )
      );

  }

  async execute(interaction) {
    try {
      const search = interaction.options.getString("game");
      if (interaction.isAutocomplete()) {
        if (!search) {
          await interaction.respond([]);
          return;
        }
        await interaction.respond(
          await BoardGameGeek.Search(search, this.client.config.BGGToken)
        );
      } else {
        if (isNaN(search)){
          await interaction.reply({
            content: `Please choose from the available options`,
            ephemeral: true
          })
          return
        }

        let ephemeral = BoardGameGeek.isEphemeral(interaction.options.getString("details"))
        await interaction.deferReply({
          ephemeral: ephemeral
        });
       
        let bgg = await BoardGameGeek.CreateAndLoad(search, this.client, interaction)
        await bgg.LoadEmbeds(interaction.options.getString("details") || BoardGameGeek.DetailsEnum.ALL)

        await interaction.editReply({
          embeds: bgg.embeds,
          files: bgg.attachments,
          ephemeral: ephemeral
        });
        if (bgg.otherAttachments.length > 0){
          await interaction.followUp({
            files: bgg.otherAttachments,
          });
        }
      }
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }
}

export default BGG;
