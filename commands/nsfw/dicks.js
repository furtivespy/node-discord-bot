const Command = require('../../base/Command.js')
const randomPuppy = require('random-puppy');
const Sample = require('lodash/sample');

class Dick extends Command {
    constructor(client){
        super(client, {
            name: "dick",
            description: "Show me pen15!!!",
            category: "NSFW",
            usage: "This command finds a dick pic",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["cock", "🍆", "pen15", "phallus", "prick", "wang", "knob", "dong", "joystick", "pecker", "schlong", "chode", "pecker", "wood", "skinflute", "peen", "penis", "shaft", "boner", "hogan"],
            permLevel: "User"
          })
    }
  
    async run(message, args, level) { // eslint-disable-line no-unused-vars
      if (!message.channel.nsfw) return message.channel.send("🔞 Cannot display NSFW content in a SFW channel.");
      var subreddits = [
        'PenisPics',
        'penis',
        'AsianLadyBonerGW',
        'ladybonersgw',
        'penis'
      ]
      var sub = Sample(subreddits)
      const msg = await message.channel.send(`**${message.member.displayName}** is looking for a dick...`);
      randomPuppy(sub).then( async (url) => {
        await msg.edit({
            embed: {
            "title": "Click here if the image failed to load.",
            "url": url,
            "color": 11340494,
            "image": {
                "url": url
            },
            "footer": {
                "icon_url": message.author.displayAvatarURL(),
                "text": `Requested by ${message.author.tag} | Powered by ${sub} subreddit`
            }
            }
        });
      });
    }
  }
  
  module.exports = Dick;