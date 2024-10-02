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
                var fullText = message.content.trim().toLowerCase()
                var db = this.client.getDatabase(message.guild.id)
                if (fullText.length > 0 && !message.channel.nsfw) {
                    db.markovInput(fullText)
                    this.client.logger.log(`recording text starting with ${fullText.substring(0,20)}`,'log')
                }
                var responseChance = parseInt(message.settings.randRspPct)
                var respond = Math.floor(Math.random() * 100)
                if(respond < responseChance || message.mentions.has(this.client.user)){                
                    var words = db.makeSentence(message.settings.markovLevel)

                    if (message.mentions.has(this.client.user)) {
                        const context = await this.client.geminiAI.buildContext(message, words)
                        const result = await this.client.geminiAI.generateContent(context, message)
                        message.channel.send(result)
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