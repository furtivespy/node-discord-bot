const Event = require('../base/Event.js')
const EventTypes = require('../base/EventTypes.js')
const { MessageEmbed } = require("discord.js")

const EmptyStarboardData = {
    starboardChannel: undefined,
    starboardChannelId: undefined,
    starEmoji: "⭐",
    useAllEmoji: true,
    minimumStarCount: 3
}

const IgnoredReactions = ["🅰️","🅱️"]

function resolveAttachment(msg) {
    if (msg.attachments.length > 0 && msg.attachments[0].width) {
      return msg.attachments[0];
    } else if (msg.embeds.length > 0 && msg.embeds[0].type === 'image') {
      return msg.embeds[0].image || msg.embeds[0].thumbnail;
    } else {
      return null;
    }
  }

class StarBoardAdd extends Event {
    constructor(client){
        super(client, {
            name: "StarBoardAdd",
            eventType: EventTypes.MESSAGE_REACTION_ADD,
            qualifier:"⭐",
            description: "Add some stars!",
            category: "Miscellaneous",
            usage: "React to message to add messge to starboard",
            enabled: true,
            guildOnly: true,
            showHelp: true,
            permLevel: "Moderator"
          })
    }
  
    async run(reaction, user, level) { // eslint-disable-line no-unused-vars
        try {
            if (IgnoredReactions.includes(reaction._emoji.name)) { return }
            var starboardData = Object.assign(EmptyStarboardData, this.client.getGameData(reaction.message.guild, 'STARBOARD'))
            if (!starboardData.starboardChannel) { return }
            if ((reaction._emoji == starboardData.starEmoji || starboardData.useAllEmoji) && reaction.count >= starboardData.minimumStarCount) {
                var db = this.client.getDatabase(reaction.message.guild.id)
                const starChan = reaction.message.guild.channels.cache.find(c => c.id == starboardData.starboardChannelId)
                if (!starChan || !starChan.permissionsFor(this.client.user).has("SEND_MESSAGES")) { return }

                var starMsg = db.starboardFind(reaction.message.id, reaction._emoji.name)
                
                const msg = await reaction.message.fetch();
                await msg.member.fetch()
                if (reaction.message.channel.nsfw) {
                    msg.attachments = undefined
                    msg.embeds = []
                    msg.content = `[NSFW Post](${msg.url})`
                }
                const attachments = msg.attachments && msg.attachments.first() ? msg.attachments.first() : undefined;
                var theEmbed = new MessageEmbed()
                if (msg.embeds[0]) {
                    theEmbed = new MessageEmbed(msg.embeds[0])
                } else {
                    theEmbed.color = 15133822
                    theEmbed.description = msg.content
                }
                theEmbed.timestamp = msg.createdAt
                theEmbed.color = 15133822
                theEmbed.author = {
                    "name": msg.member.displayName,
                    "icon_url": msg.author.displayAvatarURL(),
                    "url": msg.url,
                }
                theEmbed.footer = {text: `in #${msg.channel.name}`}
                theEmbed.addField("Source", `[link](${msg.url})`)
                if (attachments) { theEmbed.image = attachments}

                if (!starMsg) {
                    var newStarMsg = await starChan.send({content: `${reaction._emoji.id ? "<:" + reaction._emoji.name + ":" + reaction._emoji.id + ">" : reaction._emoji}x${reaction.count}`, embeds: [theEmbed]})

                    db.starboardAdd({message: msg.id, starMessage: newStarMsg.id, startype: reaction._emoji.name })
                } else {
                    var starPost = await starChan.messages.fetch(starMsg.starMessage)
                    
                    await starPost.edit({content: `${reaction._emoji.id ? "<:" + reaction._emoji.name + ":" + reaction._emoji.id + ">" : reaction._emoji}x${reaction.count}`,
                        embeds: [theEmbed]})
                }
            } 
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}
  
module.exports = StarBoardAdd;