const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField } = require('discord.js');

class Test extends SlashCommand {
    constructor(client){
        super(client, {
            name: "test",
            description: "Test the bot.",
            usage: "Use this command to test the bot",
            enabled: true,
            permLevel: "User"
          })
		  this.data = new SlashCommandBuilder()
        .setName(this.help.name)
        .setDescription(this.help.description)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
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

module.exports = Test