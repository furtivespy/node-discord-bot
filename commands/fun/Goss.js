const Command = require('../../base/Command.js')

class Goss extends Command {
    constructor(client){
        super(client, {
            name: "goss",
            description: "Alerts the mooks of goss",
            category: "Fun",
            usage: "\n- works well if followed by single emoji",
            enabled: true,
            guildOnly: true,
            allMessages: false,
            showHelp: true,
            aliases: ["gossip", "mildgoss"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            message.reply({
                content: "The Goss command is now deprecated. Please use the `/gossip` command instead.",
            })
        } catch (e) {
            this.client.logger.log(e,'error');
        }
    }
}

module.exports = Goss