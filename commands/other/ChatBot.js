const Command = require('../../base/Command.js')
class Chatbot extends Command {
    constructor(client){
        super(client, {
            name: "chatbot",
            description: "Bot Chats With you",
            category: "Other",
            usage: "Under Construction",
            enabled: true,
            guildOnly: true,
            allMessages: true,
            showHelp: true,
            aliases: ["chat"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            if(message.command && (message.command == "chatbot" || message.command == "chat")) {

            } else {
                if (message.system) {
                    return
                }
                var fullText = message.content.trim().toLowerCase()
                var db = this.client.getDatabase(message.guild.id)
                const skipChannels = this.client.getSkipChannels(message.guild)
                if (fullText.length > 0 && !message.channel.nsfw) {
                    if (!skipChannels.includes(message.channel.id)) {
                    db.markovInput(fullText)
                    this.client.logger.log(`recording text starting with ${fullText.substring(0,20)}`,'log')
                    }
                }
                var responseChance = parseInt(message.settings.randRspPct)
                var respond = Math.floor(Math.random() * 100)
                if(respond < responseChance || message.mentions.has(this.client.user)){             
                    var words = db.makeSentence(message.settings.markovLevel)

                    if (message.mentions.has(this.client.user)) {
                        const context = await this.client.geminiAI.buildContext(message, words)
                        const result = await this.client.geminiAI.generateContent(context, message)
                        const parts = result.split('||SEPARATE||').map(chunk => chunk.trim())
                        for (const thought of parts) {
                            await message.channel.send(thought)
                        }
                    } else {
                        await message.channel.send(words)
                    }
                }
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Chatbot