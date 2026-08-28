const Command = require('../../base/Command.js')
class Chatbot extends Command {
    constructor(client){
        super(client, {
            name: "chatbot",
            description: "Bot Chats With you",
            category: "Other",
            usage: "Under Construction",
            enabled: true,
            guildOnly: true,
            allMessages: true,
            showHelp: true,
            aliases: ["chat"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            if(message.command && (message.command == "chatbot" || message.command == "chat")) {

            } else {
                if (message.system) {
                    return
                }
                var fullText = message.content.trim().toLowerCase()
                var db = this.client.getDatabase(message.guild.id)
                const skipChannels = this.client.getSkipChannels(message.guild)
                if (fullText.length > 0 && !message.channel.nsfw) {
                    if (!skipChannels.includes(message.channel.id)) {
                    db.markovInput(fullText)
                    this.client.logger.log(`recording text starting with ${fullText.substring(0,20)}`,'log')
                    }
                }
                var responseChance = parseInt(message.settings.randRspPct)
                var respond = Math.floor(Math.random() * 100)
                if(respond < responseChance || message.mentions.users.has(this.client.user.id)){             
                    var words = db.makeSentence(message.settings.markovLevel)

                    if (message.mentions.users.has(this.client.user.id)) {
                        console.log("responding...")
                        const contents = await this.client.geminiAI.buildContext(message, words)
                        const {response, imageResponse} = await this.client.geminiAI.generateContent(contents, message)
                        const parts = response.split('||SEPARATE||').map(chunk => chunk.trim()).filter(Boolean)
                        for (let i = 0; i < parts.length; i++) {
                            const thought = i === 0
                                ? keepFirstMentions(parts[i], message.guild)
                                : replaceMentionsWithNicks(parts[i], message.guild)
                            await message.channel.send({
                                content: thought.slice(0, 2000),
                                allowedMentions: mentionOptions(thought, i === 0)
                            })
                        }
                        if (imageResponse) {
                            await message.channel.send({files: [imageResponse]})
                        }
                    } else {
                        await message.channel.send(words)
                    }
                }
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

const USER_MENTION = /<@!?(\d+)>/g

function nickFor(guild, userId) {
    const member = guild?.members.cache.get(userId)
    return member?.displayName || member?.user?.globalName || member?.user?.username || userId
}

function keepFirstMentions(text, guild) {
    const seen = new Set()
    return text.replace(USER_MENTION, (match, id) => {
        if (seen.has(id)) return nickFor(guild, id)
        seen.add(id)
        return match
    })
}

function replaceMentionsWithNicks(text, guild) {
    return text.replace(USER_MENTION, (_, id) => nickFor(guild, id))
}

function mentionOptions(text, allowUserPings) {
    if (!allowUserPings) {
        return { parse: [], users: [] }
    }
    const users = [...new Set([...text.matchAll(USER_MENTION)].map((match) => match[1]))]
    return { parse: [], users }
}

module.exports = Chatbot
