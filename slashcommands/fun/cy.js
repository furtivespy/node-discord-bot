const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');
const fetch = require('node-fetch');
const { MessageEmbed } = require('discord.js');

class Cy extends SlashCommand {
    constructor(client){
        super(client, {
            name: "cy",
            description: "Shitty inspriation like 'cychology' spouted by Cy Wakeman",
            usage: "Get's an AI generated inspirational image & quote",
            enabled: true,
            permLevel: "User"
          })
        this.data = new SlashCommandBuilder()
            .setName(this.help.name)
            .setDescription(this.help.description)  
    }

    async execute(interaction) {
        try {
            await interaction.deferReply()

            let res = await fetch('http://inspirobot.me/api?generate=true')
            let text = await res.text()
            
            const inspiration = new MessageEmbed()
                .setColor(6682360)
                .setImage(text)
                .setFooter({text: `Powered by inspirobot.me`})

            interaction.editReply({embeds: [inspiration]})
                
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Cy