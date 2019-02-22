const Command = require('../../base/Command.js')
const fetch = require('node-fetch');
var cheerio = require('cheerio');

class Cat extends Command {
    constructor(client){
        super(client, {
            name: "cat",
            description: "meow",
            category: "Animals",
            usage: "cat",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["cats","meow","kitten","kitty"],
            permLevel: "User"
          })
    }
  
    async run(message, args, level) { // eslint-disable-line no-unused-vars
      
      const msg = await message.channel.send(`I'm looking for a nice kitty...`);
      fetch("https://catfact.ninja/fact").then(res => res.json()).then( data => {
        fetch("https://www.peppercarrot.com/extras/html/2016_cat-generator/index.php").then(res => res.text()).then(body => {
            var $ = cheerio.load(body);
            var catAvatar = $('img.avatar').attr('src');
            fetch("https://aws.random.cat/meow").then(res => res.json()).then(async cat => {
                await msg.edit({
                    embed: {
                        "description": data.fact,
                        "color": 12746254,
                        "image": {
                            "url": cat.file
                        },
                        "author": {
                            "name": "Cat Fact",
                            "icon_url": `https://www.peppercarrot.com/extras/html/2016_cat-generator/${catAvatar}`,
                        },
                        "thumbnail": {
                            "url": `https://www.peppercarrot.com/extras/html/2016_cat-generator/${catAvatar}`
                        },
                    }
                });
            })
        })
      });
    }
  }
  
  module.exports = Cat;