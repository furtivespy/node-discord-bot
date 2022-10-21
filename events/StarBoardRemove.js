const Event = require('../base/Event.js')
const EventTypes = require('../base/EventTypes.js')
const { EmbedBuilder, PermissionsBitField } = require("discord.js")

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

class StarBoardRemove extends Event {
    constructor(client){
        super(client, {
            name: "StarBoardRemove",
            eventType: EventTypes.MESSAGE_REACTION_REMOVE,
            qualifier:"⭐",
            description: "Remove some stars!",
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
            var db = this.client.getDatabase(reaction.message.guild.id)
            const starChan = reaction.message.guild.channels.cache.find(c => c.id == starboardData.starboardChannelId)
            if (!starChan || !starChan.permissionsFor(this.client.user).has(PermissionsBitField.Flags.SendMessages)) { return }

            var starMsg = db.starboardFind(reaction.message.id, reaction._emoji.name)
            if (!starMsg) { return }
            
            const msg = await reaction.message.fetch();
            if (reaction.message.channel.nsfw) {
                msg.attachments = undefined
                msg.embeds = []
                msg.content = `[NSFW Post](${msg.url})`
            }
            const attachments = msg.attachments && msg.attachments.first() ? msg.attachments.first() : undefined;

            var theEmbed = new EmbedBuilder()
            if (msg.embeds[0]) {
                theEmbed = new EmbedBuilder(msg.embeds[0])
            } else {
                theEmbed.setColor(15133822)
                theEmbed.setDescription(msg.content)
            }
            theEmbed.setTimestamp(msg.createdAt)
            theEmbed.setColor(15133822)
            theEmbed.setAuthor({
                "name": msg.member.displayName,
                "icon_url": msg.author.displayAvatarURL(),
                "url": msg.url,
            })
            theEmbed.setFooter({text: `in #${msg.channel.name}`})
            theEmbed.addFields({name: "Source", value: `[link](${msg.url})`})
            if (attachments) { theEmbed.setImage(attachments)}

            var starPost = await starChan.messages.fetch(starMsg.starMessage)
            if (reaction.count < starboardData.minimumStarCount) {
                db.starboardDelete(starMsg.starMessage)
                starPost.delete().catch(O_o=>{})
            } else {
                await starPost.edit({
                    content: `${reaction._emoji.id ? "<:" + reaction._emoji.name + ":" + reaction._emoji.id + ">" : reaction._emoji}x${reaction.count}`, 
                    embeds: [theEmbed]
                })
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}
  
module.exports = StarBoardRemove;