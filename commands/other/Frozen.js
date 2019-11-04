const Command = require('../../base/Command.js')
const _ = require('lodash');

class Frozen extends Command {
    constructor(client){
        super(client, {
            name: "frozen",
            description: "Constable Frozen",
            category: "Other",
            usage: "Ice Cream is Delicious...",
            enabled: true,
            guildOnly: true,
            allMessages: true,
            showHelp: true,
            aliases: ["freeze","froze"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            var messageText = message.content.trim().toLowerCase()
            if((message.command && (message.command == "frozen" || message.command == "freeze"))
             || (_.includes(messageText, "frozen") || _.includes(messageText, "freeze") || _.includes(messageText, "froze"))) {
                 await message.react("⛄")
                 await message.react("🍦") 
                 message.react("👸") 
                 
                 //message.react(message.guild.emojis.find('name', "icecream"))
                 //message.react(message.guild.emojis.find('name', "princess"))
             }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Frozen