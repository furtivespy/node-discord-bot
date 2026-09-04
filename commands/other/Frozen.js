import Command from '../../base/Command.js';
import includes from 'lodash/includes.js';


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
             || (includes(messageText, "frozen") || includes(messageText, "freeze") || includes(messageText, "froze"))) {
                 await message.react("⛄")
                 await message.react("🍦") 
                 message.react("👸")                  
             }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

export default Frozen