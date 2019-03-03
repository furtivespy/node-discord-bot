const Command = require('../../base/Command.js')
const fetch = require('node-fetch');

class Panda extends Command {
    constructor(client){
        super(client, {
            name: "panda",
            description: "Panda Bears",
            category: "Animals",
            usage: "Type command, get panda fact",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["pandas","pando","pandabear"],
            permLevel: "User"
          })
    }
  
    async run(message, args, level) { // eslint-disable-line no-unused-vars
      
      const msg = await message.channel.send(`I'm looking for a swell panda...`);
      fetch("https://some-random-api.ml/pandafact").then(res => res.json()).then( data => {
            fetch("https://some-random-api.ml/pandaimg").then(res => res.json()).then(async panda => {
                await msg.edit({
                    embed: {
                        "description": data.fact,
                        "color": 1,
                        "image": {
                            "url": panda.link
                        },
                        "author": {
                            "name": "Panda Fact",
                            "icon_url": panda.link,
                        },
                    }
                });
            })
      });
    }
  }
  
  module.exports = Panda;