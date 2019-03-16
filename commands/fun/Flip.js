const Command = require('../../base/Command.js')
const flip = require('flip');

class Flip extends Command {
    constructor(client){
        super(client, {
            name: "flip",
            description: "Flip a table or something",
            category: "Fun",
            usage: "command will flip a table, if you follow flip with text, will flip the text instead of a table",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["tableflip"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            var toFlip = (!args || args.length == 0) ? "┬─┬" : args.join(" ")
            var msg = await message.channel.send(`(°-°)\\ ${toFlip}`)
            await super.pause(750)
            msg.edit(`(╯°□°)╯    ]`)
            await super.pause(750)
            msg.edit(`(╯°□°)╯ ︵ ${(!args || args.length == 0) ? "┻━┻" : flip(toFlip)}`)
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Flip