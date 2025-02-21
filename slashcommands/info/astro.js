const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');

class Astro extends SlashCommand {
    constructor(client){
        super(client, {
            name: "astro",
            description: "NASA Astronomy Picture of the Day",
          })
        this.data = new SlashCommandBuilder()
            .setName(this.help.name)
            .setDescription(this.help.description)
            .addStringOption(option => option.setName('date').setDescription('The date of the picture').setRequired(false))
        }

    async execute(interaction) {
        try {
            const date = interaction.options.getString('date')
            const jsDate = new Date(date)
            
          await interaction.deferReply()

            const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${this.client.config.NASA_API_KEY}`)
            const data = await res.json()
          
            const embed = new EmbedBuilder()
                .setTitle(data.title)
                .setDescription(data.explanation)
                .setColor(Math.floor(Math.random() * 16777215))
                .setImage(data.url)
                .setFooter({text: `Date: ${data.date}`})

            interaction.editReply({embeds: [embed]})
                
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Astro;