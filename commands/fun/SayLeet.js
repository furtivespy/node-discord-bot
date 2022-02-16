const Command = require('../../base/Command.js')
const leet = require('leet')

class SayLeet extends Command {
    constructor(client){
        super(client, {
            name: "sayleet",
            description: "Make Bender speak like a H4x0r.",
            category: "Fun",
            usage: "Use command followed by anything you want the bot to say - Bot will delete your message and say it himself\n- e.x.: '!say I am a robot'",
            enabled: false,
            guildOnly: true,
            allMessages: false,
            showHelp: true,
            aliases: ["say1337"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            const sayMessage = args.join(" ");
            message.delete().catch(O_o=>{}); 
            message.channel.send(leet.convert(sayMessage));
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = SayLeet