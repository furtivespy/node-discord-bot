const Command = require('../../base/Command.js')
const database =  require('../../db/db.js')

class Say extends Command {
    constructor(client){
        super(client, {
            name: "say",
            description: "Make Bender speak.",
            category: "Fun",
            usage: "Use command followed by anything you want the bot to say - Bot will delete your message and say it himself\n- e.x.: '!say I am a robot'",
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
            if (sayMessage.length == 0) {
                var db = new database(message.guild.id)
                var words = db.makeSentence3()
                message.channel.send(words)
            } else {
                message.channel.send(sayMessage);
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Say