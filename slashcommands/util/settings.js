import SlashCommand from '../../base/SlashCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import { PermissionsBitField } from 'discord.js';


class Settings extends SlashCommand {
    constructor(client){
        super(client, {
            name: "settings",
            description: "Adjust bot settings",
            hidden: true,
          })
		  this.data = new SlashCommandBuilder()
        .setName(this.help.name)
        .setDescription(this.help.description)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addStringOption(option => option.setName('setting').setDescription('The setting to adjust').setRequired(true))
        .addStringOption(option => option.setName('value').setDescription('The value to set the setting to').setRequired(false))
    }

    async execute(interaction) {
        try {
          if (interaction.member.id !== this.client.config.botOwnerId) {
            return interaction.reply({content: 'You do not have permission to use this command.', ephemeral: true})
          }
          const setting = interaction.options.getString('setting')
          const value = interaction.options.getString('value')
          const settings = this.client.config
          if (!value || value === '') {
            await interaction.reply({content: `The current ${setting} is ${settings[setting]}.`, ephemeral: true})
            return
          }
          await interaction.reply({content: `Setting ${setting} set to ${value}`, ephemeral: true})
          settings[setting] = value
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

export default Settings