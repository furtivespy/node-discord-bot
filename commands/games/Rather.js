const Command = require('../../base/Command.js')
const fetch = require('node-fetch');
const _ = require('lodash')

class Rather extends Command {
    constructor(client){
        super(client, {
            name: "rather",
            description: "Play a game of Would You Rather",
            category: "Games",
            usage: "use command to have the bot poll a Would You Rather",
            enabled: true,
            guildOnly: true,
            allMessages: false,
            showHelp: true,
            aliases: ["wyr", "wouldyourather"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            var msg = await message.channel.send(`Would you rather...`)
            
            fetch(`https://www.rrrather.com/botapi`).then(res => res.json()).then(async json => {
                await msg.edit(`${json.title}\n🅰️ ${json.choicea}\nOR\n🅱️ ${json.choiceb} `)
                await msg.react("🅰️")
                await msg.react("🅱️")
            })
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Rather
