import SlashCommand from "../../base/SlashCommand.js";

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import urban from '../../modules/UrbanDictionary.js';
class Urban extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "urban",
      description: "Look up an Urban Dictionary definition",
      usage: "Use this command to find a urban dictionary definition",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("search")
          .setDescription("The term to search for - leave blank for a random definition")
      );
  }

  async execute(interaction) {
    try {
      await interaction.deferReply()
      const search = interaction.options.getString("search");
      let results = []
      if (search.length >= 1) {
        results = await urban.search(search)
      } else {  
        results = await urban.random()
      }
      
      if (results.length === 0) {
        await interaction.editReply({
          content: `Unable to find a definition for '${search}'`,
          ephemeral: true,
        });
      } else {  

        let embedMap = results.map((result, i) => {
          return new EmbedBuilder()
            .setColor(13749966)
            .setTitle(result.word)
            .setURL(result.permalink)
            .setDescription(result.definition)
            .addFields({name: "💬", value: result.example},
                    {name: "📈", value: `👍 ${result.thumbs_up} 👎 ${result.thumbs_down}`})
            .setFooter({text: `Definition ${i+1} of ${results.length}`})
        })
        let actions = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('prev')
              .setLabel('⬅️')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('next')
              .setLabel('➡️')
              .setStyle(ButtonStyle.Primary)
          )
        let currentPage = 0
        let filter = (x) => x.user.id === interaction.user.id && (x.customId === 'prev' || x.customId === 'next')
        
        let reply = await interaction.editReply({embeds: [embedMap[currentPage]], components: [actions]})
        let newInteraction = await reply.awaitMessageComponent({ filter, time: 60_000 }).catch(err => this.client.logger.log(err,'error'))
        while (newInteraction) {
          await newInteraction.deferUpdate()
          if (newInteraction.customId === 'next') {
            currentPage++
            if (currentPage >= results.length) {
              currentPage = 0
            }
          } else {
            currentPage--
            if (currentPage < 0) {
              currentPage = results.length - 1
            }
          }
          reply = await interaction.editReply({embeds: [embedMap[currentPage]], components: [actions]})
          newInteraction = await reply.awaitMessageComponent({ filter, time: 60_000 }).catch(err => this.client.logger.log(err,'warn'))
        } 
        await interaction.editReply({embeds: [embedMap[currentPage]], components: []})
      }


    } catch (e) {
      console.log(e)
      this.client.logger.log(e, "error");
    }
  }
}

export default Urban;
