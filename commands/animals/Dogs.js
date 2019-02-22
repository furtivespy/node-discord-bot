const Command = require('../../base/Command.js')
const fetch = require('node-fetch');

class Dog extends Command {
    constructor(client){
        super(client, {
            name: "dog",
            description: "woof",
            category: "Animals",
            usage: "dog",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["dogs","woof","doggo","pupper", "puppy", "doggy"],
            permLevel: "User"
          })
    }
  
    async run(message, args, level) { // eslint-disable-line no-unused-vars
      
      const msg = await message.channel.send(`I'm looking for a good doggo...`);
      fetch("https://dog-api.kinduff.com/api/facts").then(res => res.json()).then( data => {
            fetch("https://dog.ceo/api/breeds/image/random").then(res => res.json()).then(async dog => {
                await msg.edit({
                    embed: {
                        "description": data.facts[0],
                        "color": 6700573,
                        "image": {
                            "url": dog.message
                        },
                        "author": {
                            "name": "Dog Fact",
                            "icon_url": dog.message,
                        },
                    }
                });
            })
      });
    }
  }
  
  module.exports = Dog;