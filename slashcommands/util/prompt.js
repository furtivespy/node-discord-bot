const { SlashCommandBuilder } = require('@discordjs/builders');
const SlashCommand = require('../../base/SlashCommand.js')

class Prompt extends SlashCommand {
  constructor(client){
    super(client, {
        name: "prompt",
        description: "Send a prompt to GeminiAI",
        usage: "Use this command",
        enabled: true,
        permLevel: "User"
      });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption(option =>
        option.setName('message')
          .setDescription('The prompt to send to GeminiAI')
          .setRequired(true))
  }
		
	async execute(interaction) {
		const prompt = interaction.options.getString('message');

		await interaction.deferReply();

		try {
			const response = await interaction.client.geminiAI.runPrompt(prompt)

			let msg = await interaction.editReply(response[0]);
			if (response.length > 1) {
				for (let i = 1; i < response.length; i++) {
					msg = await msg.reply(response[i]);
				}
			}

		} catch (error) {
			console.error('Error in /prompt command:', error);
			await interaction.editReply('Sorry, there was an error processing your prompt. Please try again later.');
		}
	}
};

module.exports = Prompt