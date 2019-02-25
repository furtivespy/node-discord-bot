const Command = require('../../base/Command.js')
const fetch = require('node-fetch')
var qs = require( 'querystring' )
const Roller = require('roll')
const Sample = require('lodash/sample')

class Roll extends Command {
    constructor(client){
        super(client, {
            name: "roll",
            description: "Roll Some Dice",
            category: "Games",
            usage: "roll <dice to roll including modifiers, >",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["r", "dice"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            const fullArgs = args.join(" ").toLowerCase()
            
            var roll = new Roller();
            if (roll.validate(fullArgs)){
                var rolling = roll.roll(fullArgs);
                var embedItem =  {
                        "title": rolling.input.toString(),
                        "description": `You rolled: **${rolling.result}**`,
                        "color": 4130114,
                        "footer": {
                            "icon_url": message.author.displayAvatarURL,
                            "text": `${message.author.tag} Rolled ${rolling.rolled}`
                        },
                    }
                var query = qs.stringify({key: this.client.config.pixabayKey, q: "number " + rolling.result})
                fetch ("https://pixabay.com/api/?" + query).then(res => res.json()).then(pictures => {
                    if (pictures.totalHits > 0){
                        var thumb = Sample(pictures.hits)
                        embedItem.thumbnail = {
                            "url": thumb.previewURL
                        }
                    }
                    message.delete().catch(O_o=>{})
                    message.channel.send({embed: embedItem})
                })
            } else {
                message.react('🚫')
                message.react('🎲')
                message.react(message.guild.emojis.get('548934402646999042')).catch(this.client.logger.log("no emoji", 'error'))
            }

        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Roll