const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');

class Ping extends SlashCommand {
    constructor(client){
        super(client, {
            name: "ping",
            description: "Get's Bender's Ping.",
            usage: "Use this command to make sure the bot is still there and responding",
            enabled: true,
            permLevel: "User"
          })
		  this.data = new SlashCommandBuilder().setName(this.help.name).setDescription(this.help.description)
    }

    async execute(interaction) {
        try {
			const msg = await interaction.reply({content: 'Pong!', fetchReply: true});
			msg.edit(`Pong! Latency is ${msg.createdTimestamp - interaction.createdTimestamp}ms. `)
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Ping