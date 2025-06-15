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
  // 1. Check direct attachments
  if (msg.attachments && msg.attachments.size > 0) {
    const firstAttachment = msg.attachments.first();
    if (firstAttachment.contentType && firstAttachment.contentType.startsWith('image/')) {
      return firstAttachment; // Returns MessageAttachment, which has a .url property
    }
  }

  // 2. Check embeds for various image properties
  if (msg.embeds && msg.embeds.length > 0) {
    const embed = msg.embeds[0]; // Process the first embed

    if (embed.image && embed.image.url) {
      return embed.image.url; // Returns a URL string
    }
    if (embed.thumbnail && embed.thumbnail.url) {
      return embed.thumbnail.url; // Returns a URL string
    }
    if (embed.type === 'image' && embed.url) {
        return embed.url; // Returns a URL string
    }
  }
  return null; // No suitable image found
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

            var theEmbed = new EmbedBuilder();
            let imageSetSuccessfully = false;

            // Set basic properties
            theEmbed.setColor(15133822);
            theEmbed.setTimestamp(msg.createdAt);
            theEmbed.setAuthor({
              name: msg.member ? msg.member.displayName : msg.author.username, // Fallback for author name
              icon_url: msg.author.displayAvatarURL(),
              url: msg.url,
            });
            theEmbed.setFooter({ text: `in #${msg.channel.name}` });
            theEmbed.addFields({ name: "Source", value: `[link](${msg.url})` });

            // Resolve and set the image using the updated resolveAttachment
            const imageToStar = resolveAttachment(msg);
            if (imageToStar) {
              let imageUrl = null;
              if (typeof imageToStar === 'string') { // URL from embed
                imageUrl = imageToStar;
              } else if (imageToStar.url) { // MessageAttachment object
                imageUrl = imageToStar.url;
              }

              if (imageUrl) {
                theEmbed.setImage(imageUrl);
                imageSetSuccessfully = true;
              }
            }

            // Set description
            let descriptionText = "";
            if (msg.content && msg.content.length > 0) {
              descriptionText = msg.content;
            } else if (msg.embeds[0] && msg.embeds[0].description && msg.embeds[0].description.length > 0) {
              // Fallback to original embed's description if message content is empty
              descriptionText = msg.embeds[0].description;
            }

            // Set description on the embed. If no text content and no image, it will be an empty string.
            // If there's an image but no text, description remains unset (actually, it will be set to "" by below)
            // This ensures setDescription always receives a string.
            if (descriptionText.length > 0) {
                theEmbed.setDescription(descriptionText);
            } else if (!imageSetSuccessfully) {
                // If there's no text content from msg or embed, AND no image, set to a safe default like "--" or ""
                // For consistency with StarboardAdd, let's use "--" if truly empty.
                // However, the original error was just needing a string. Empty string is safest.
                theEmbed.setDescription(""); // Default to empty string to prevent error if all else fails
            }
            // If imageSetSuccessfully is true and descriptionText is empty,
            // setDescription will not be called unless the above line is `theEmbed.setDescription(descriptionText || "")`
            // Let's ensure it's always set to something to fulfill the contract of `edit` expecting an embed with a description field potentially.
            // Final decision: use `descriptionText` which defaults to `""` if no content, or set explicitly.
            // The crucial part is `setDescription` must be called with a string.
            
            theEmbed.setDescription(descriptionText || "-"); // Ensures it's always a string.

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