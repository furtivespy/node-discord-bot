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
        const raw = interaction.options.getString('word') || ''
        const word = raw.trim().split(/\s+/)[0].toLowerCase()
        const db = this.client.getDatabase(interaction.guild?.id)
        const settings = this.client.getSettings(interaction.guild)
        let words = ''
        try {
            words = db.makeSentence(settings.markovLevel, word)
        } catch (e) {
            this.client.logger.log(e,'error')
        }
        const content = (typeof words === 'string' && words.trim())
            ? words
            : "I haven't learned enough words yet."
        await interaction.reply({ content })
    }
}

module.exports = Markov
