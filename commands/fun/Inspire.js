const Command = require('../../base/Command.js')
const fetch = require('node-fetch');
var qs = require( 'querystring' );

class Inspire extends Command {
    constructor(client){
        super(client, {
            name: "inspire",
            description: "Get's an AI generated inspirational image & quote",
            category: "Fun",
            usage: "",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["inspiration", "cycology", "cychology", "cy", "wakeman", "cywakeman"],
            permLevel: "User"
          })
    }

    async run (message, [first, ...rest], level) {
        try {
            var msg = await message.channel.send(`Attempting to inspire ${message.member.displayName}...`)
            fetch('http://inspirobot.me/api?generate=true').then(res => res.text()).then(text => {
                msg.edit({
                    embeds: [{
                        "image": {
                            "url": text
                        },
                        "color": 6682360,
                        "footer": {
                            "text": `Powered by inspirobot.me`
                        }
                    }]
                })
            })
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Inspire