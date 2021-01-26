const Command = require('../../base/Command.js')

const EmptyStarboardData = {
    starboardChannel: undefined,
    starboardChannelId: undefined,
    starEmoji: "⭐",
    useAllEmoji: true,
    minimumStarCount: 3
}

class Starboard extends Command {
    constructor(client){
        super(client, {
            name: "starboard",
            description: "Message Highlights",
            category: "Other",
            usage: "use the 'starboard' command to configure the starboard",
            enabled: true,
            guildOnly: true,
            allMessages: false,
            showHelp: true,
            aliases: ["sb"],
            permLevel: "Administrator"
          })
    }

    async run (message, args, level) {
        try {
            var starboardData = Object.assign(EmptyStarboardData, this.client.getGameData(message.guild, 'STARBOARD'))

            if(!args[0]) {
                const array = [];
                array.push(`channel${" ".repeat(13)}::  ${starboardData.starboardChannel ? starboardData.starboardChannel : ""}`)
                array.push(`emoji${" ".repeat(15)}::  ${starboardData.starEmoji}`)
                array.push(`useall${" ".repeat(14)}::  ${starboardData.useAllEmoji}`)
                array.push(`minimum${" ".repeat(13)}::  ${starboardData.minimumStarCount}`)
                await message.channel.send(`= Current Starboard Settings =\n${array.join("\n")}`, {code: "asciidoc"})
                await message.channel.send("to update, use the name above with a new value\ne.g.: !starboard minimum 4")
            } else if (args[0] == "channel") {
                var newChan = args[1]
                if (args[1].indexOf("<") === 0) {
                    newChan = args[1].slice(2,-1)
                }
                const chan = message.guild.channels.cache.find(c => c.name == newChan || c.id == newChan)
                if (chan && chan.permissionsFor(this.client.user).has("SEND_MESSAGES")) {
                    starboardData.starboardChannel = chan.name
                    starboardData.starboardChannelId = chan.id
                    message.reply("Channel Updated")
                } else {
                    message.reply("I can't find or post in that channel")
                }
            } else if (args[0] == "emoji") {
                if (args[1]) {
                    starboardData.starEmoji = args[1]
                    message.reply("Emoji Updated")
                }
            } else if (args[0] == "useall") {
                if (args[1].toLowerCase() == "true") {
                    starboardData.useAllEmoji = true
                    message.reply("Updated")
                } else if (args[1].toLowerCase() == "false") {
                    starboardData.useAllEmoji = false
                    message.reply("Updated")
                } else {
                    message.reply("Only 'true' or 'false' are acceptable")
                }
            } else if (args[0] == "minimum") {
                if (Number.isInteger(+args[1])) {
                    starboardData.minimumStarCount = +args[1]
                    message.reply("Minimum Updated")
                } else {
                    message.reply("Numbers Only!")
                }
            }

            this.client.setGameData(message.guild, 'STARBOARD', starboardData)
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Starboard