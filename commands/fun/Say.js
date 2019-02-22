const Command = require('../../base/Command.js')

class Say extends Command {
    constructor(client){
        super(client, {
            name: "say",
            description: "Make Bender speak.",
            category: "Fun",
            usage: "!say I am Bender. I bend things.",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: [],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            const sayMessage = args.join(" ");
            message.delete().catch(O_o=>{}); 
            message.channel.send(sayMessage);
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Say