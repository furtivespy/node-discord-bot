const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');

class Markov extends SlashCommand {
    constructor(client){
        super(client, {
            name: "markov",
            description: "Make Bender speak.",
            usage: "Provide a word and Bender starts a chain with that word",
            enabled: true,
            permLevel: "User"
          })
        this.data = new SlashCommandBuilder()
            .setName(this.help.name)
            .setDescription(this.help.description)
            .addStringOption(option =>
                option
                    .setName('word')
                    .setDescription('A word to start the sentence with')
                    .setRequired(true)
            )
    }

    async execute(interaction) {
        try {
            const word = interaction.options.getString('word')
            const db = this.client.getDatabase(interaction.guild?.id)
            const settings = this.client.getSettings(interaction.guild)
            const words = db.makeSentence(settings.markovLevel, word)
            await interaction.reply({ content: words })
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Markov
