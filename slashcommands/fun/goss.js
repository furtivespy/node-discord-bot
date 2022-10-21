const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');

class Goss extends SlashCommand {
    constructor(client){
        super(client, {
            name: "gossip",
            description: "Share some juicy gossip",
            usage: "Share some juicy gossip",
            enabled: true,
            permLevel: "User"
          })
        this.data = new SlashCommandBuilder()
            .setName(this.help.name)
            .setDescription(this.help.description)
            .addSubcommand(subcommand => 
                subcommand
                    .setName('minor')
                    .setDescription('gossip without a ping')
                    .addStringOption(option => option.setName('message').setDescription('The hot gossip to share').setRequired(true))
                    )
            .addSubcommand(subcommand => 
                subcommand
                    .setName('regular')
                    .setDescription('gossip will ping @here')
                    .addStringOption(option => option.setName('message').setDescription('The hot gossip to share').setRequired(true))
                    )    
    }

    async execute(interaction) {
        try {
            let announce = (interaction.options.getSubcommand() == "minor") ? "Mild goss, Mooks!" : "@here Listen up, Mooks!";

            announce = `${this.client.emojis.cache.get("543465138997690368")} ${announce} ${this.client.emojis.cache.get("543465138997690368")}`
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle(`Gossip Alert!`)
                .setImage(`https://miro.medium.com/max/480/1*UUFs55EN-UseZQGor75MoA.gif`)
                .setDescription(interaction.options.getString('message'))
            

            await interaction.reply({ content: announce, embeds: [embed] })
            
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Goss