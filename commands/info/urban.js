const Command = require('../../base/Command.js')

class Urban extends Command {
    constructor(client){
        super(client, {
            name: "urban",
            description: "Searches Urban Dictionary",
            category: "Info",
            usage: "Command followed by what you'd like to searh for, e.g. '!urban nakasashi' ",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["urbandict", "urb"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            message.reply({
                content: "The Urban command is now deprecated. Please use the `/urban` command instead.",
            })
        } catch (e) {
            this.client.logger.log(e,'error');
        }
    }
}

module.exports = Urban