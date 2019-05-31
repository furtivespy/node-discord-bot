const Command = require('../../base/Command.js')
const database = require('../../db/db.js')

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
                if (fullText.length > 0) {
                    var db = new database(message.guild.id)
                    db.markovInput(fullText)
                    this.client.logger.log(`recording text starting with ${fullText.substring(0,20)}`,'log')
                }
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Chatbot