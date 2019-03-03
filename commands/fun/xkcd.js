const Command = require('../../base/Command.js')
const fetch = require('node-fetch');

class xkcd extends Command {
    constructor(client){
        super(client, {
            name: "xkcd",
            description: "xkcd comic",
            category: "Fun",
            usage: "Use this command to get a xkcd comic\n- just command will give the current day's comic\n- command followed by a number will get that specific comic",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: [],
            permLevel: "User"
          })
    }
  
    async run(message, args, level) { // eslint-disable-line no-unused-vars
        try {
            var url;
            if (!args || args.length == 0) {
                url = "https://xkcd.com/info.0.json"
            } else {
                url = `https://xkcd.com/${args[0]}/info.0.json`
            }
            var res = await fetch(url).then(res => res.json()).then(async comic => {
                await message.channel.send({
                    embed: {
                        "color": 16777215,
                        "image": {
                            "url": comic.img
                        },
                        "author": {
                            "name": comic.title,
                        },
                        "footer": {
                            "text": comic.alt
                        }
                    }
                })
            }).catch(e => this.client.logger.log(e,'error'))
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
  }
  
  module.exports = xkcd;