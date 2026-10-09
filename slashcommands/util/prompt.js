import { SlashCommandBuilder } from '@discordjs/builders';

import SlashCommand from '../../base/SlashCommand.js';
import { splitForDiscord } from '../../modules/splitForDiscord.js';
class Prompt extends SlashCommand {
  constructor(client){
    super(client, {
        name: "prompt",
        description: "Send a prompt to GeminiAI",
        usage: "/prompt message:hello",
        category: "chat",
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
      const pieces = (Array.isArray(response) ? response : [response])
        .flatMap((chunk) => splitForDiscord(chunk))
      if (pieces.length === 0) {
        await interaction.editReply("Sorry, I didn't get a response. Please try again later.")
        return
      }
      let msg = await interaction.editReply(pieces[0])
      for (let i = 1; i < pieces.length; i++) {
        msg = await msg.reply(pieces[i])
      }

		} catch (error) {
			console.error('Error in /prompt command:', error);
			await interaction.editReply('Sorry, there was an error processing your prompt. Please try again later.');
		}
	}
};

export default Prompt