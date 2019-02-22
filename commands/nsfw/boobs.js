const Command = require('../../base/Command.js')
const fetch = require('node-fetch');

class Boobs extends Command {
    constructor(client){
        super(client, {
            name: "boobs",
            description: "Show me boobies!!!",
            category: "NSFW",
            usage: "boobs",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["breasts", "(.)(.)", "jugs","cans","knockers","bongos","bubbies","bumpers","bewbz","tits","tatas","chesticles","gazongas","titties","headlamps","honkburgers","jubblies","mankillers","melons"],
            permLevel: "User"
          })
    }
  
    async run(message, args, level) { // eslint-disable-line no-unused-vars
      if (!message.channel.nsfw) return message.channel.send("🔞 Cannot display NSFW content in a SFW channel.");
      const msg = await message.channel.send(`**${message.member.displayName}** is looking for boobies...`);
      fetch("http://api.oboobs.ru/boobs/0/1/random").then(res => res.json()).then( async body => {
        await msg.edit({
            embed: {
            "title": "Click here if the image failed to load.",
            "url": `http://media.oboobs.ru/${body[0].preview}`,
            "color": 15285942,
            "image": {
                "url": `http://media.oboobs.ru/${body[0].preview}`
            },
            "footer": {
                "icon_url": message.author.displayAvatarURL,
                "text": `Requested by ${message.author.tag} | Powered by oboobs.ru`
            }
            }
        });
      });
    }
  }
  
  module.exports = Boobs;