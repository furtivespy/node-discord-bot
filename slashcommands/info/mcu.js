const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');

class MCU extends SlashCommand {
    constructor(client){
        super(client, {
            name: "mcu",
            description: "When can I get my next MCU fix?",
          })
        this.data = new SlashCommandBuilder()
            .setName(this.help.name)
            .setDescription(this.help.description)  
    }

    async execute(interaction) {
        try {
            await interaction.deferReply()

            const res = await fetch('https://www.whenisthenextmcufilm.com/api')
            const data = await res.json()

            const embed = new EmbedBuilder()
                .setTitle(data.title)
                .setDescription(data.overview)
                .setColor(6682360)
                .setImage(data.poster_url)
                .setFooter({text: `Days until next MCU fix: ${data.days_until}`})

            interaction.editReply({embeds: [embed]})
                
                
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = MCU;