const Command = require('../../base/Command.js')
const _ = require('lodash')

class Image extends Command {
    constructor(client){
        super(client, {
            name: "image",
            description: "Search for an image.",
            category: "Images",
            usage: "Use command followed by anything you want search for",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["img"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            if (args.length === 0) return
            var search = args.join(" ");
            var listImages = await super.getGoogleImg(search, false, 1, !message.channel.nsfw)
            var anImage = _.sample(listImages)
            if (anImage) {
                await message.channel.send({
                    embed: {
                        "color": 10531591,
                        "image": {
                            "url": anImage.link
                        },
                    }
                })
            } else {
                message.reply(`Sorry, I couldn't find any ${search}`)
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Image