const Command = require('../../base/Command.js')
const fetch = require('node-fetch');

class Butts extends Command {
    constructor(client){
        super(client, {
            name: "butts",
            description: "baby got back",
            category: "NSFW",
            usage: "This command finds a picture of an ass",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["buttocks", "🍑", "behind","rear","rear-end","backside","posterior","hind-quarters","hinder","heinie","derrière","rump","caboose","tail","tail-end","tail-bone","tail-feather","applebottom","ass","arse","badonkadonk","booty","breeches","britches","tush","tushy","tokus","seat","moon","haunches","hams","fanny","dumper","dump","culo","cheeks","buns","cakes","can","bum","keister","duff","fundament","hunkers","nates","trunk","stern","glutes","pooper","patootie","sit-upon","cushion","wazoo","bop","bumper","dumps","humps","bubbles","back"],
            permLevel: "User"
          })
    }
  
    async run(message, args, level) { // eslint-disable-line no-unused-vars
      if (!message.channel.nsfw) return message.channel.send("🔞 Cannot display NSFW content in a SFW channel.");
      const msg = await message.channel.send(`**${message.member.displayName}** is looking for butts...`);
      fetch("http://api.obutts.ru/butts/0/1/random").then(res => res.json()).then( async body => {
        await msg.edit({
            embed: {
            "title": "Click here if the image failed to load.",
            "url": `http://media.obutts.ru/${body[0].preview}`,
            "color": 11273754,
            "image": {
                "url": `http://media.obutts.ru/${body[0].preview}`
            },
            "footer": {
                "icon_url": message.author.displayAvatarURL(),
                "text": `Requested by ${message.author.tag} | Powered by obutts.ru`
            }
            }
        });
      });
    }
  }
  
  module.exports = Butts;