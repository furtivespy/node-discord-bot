const Event = require("../base/Event.js");
const EventTypes = require("../base/EventTypes.js");
const { EmbedBuilder, PermissionsBitField } = require("discord.js");

const EmptyStarboardData = {
  starboardChannel: undefined,
  starboardChannelId: undefined,
  starEmoji: "⭐",
  useAllEmoji: true,
  minimumStarCount: 3,
};

const IgnoredReactions = ["🅰️", "🅱️"];

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

    // Check for standard image and thumbnail properties which have a URL
    if (embed.image && embed.image.url) {
      return embed.image.url; // Returns a URL string
    }
    if (embed.thumbnail && embed.thumbnail.url) {
      return embed.thumbnail.url; // Returns a URL string
    }
    // Check if the embed itself is of type 'image' (e.g., from a direct image link like Tenor)
    // In discord.js v14, such an embed usually has its URL in 'embed.url'
    if (embed.type === 'image' && embed.url) {
        return embed.url; // Returns a URL string
    }
  }

  return null; // No suitable image found
}

class StarBoardAdd extends Event {
  constructor(client) {
    super(client, {
      name: "StarBoardAdd",
      eventType: EventTypes.MESSAGE_REACTION_ADD,
      qualifier: "⭐",
      description: "Add some stars!",
      category: "Miscellaneous",
      usage: "React to message to add message to starboard",
      enabled: true,
      guildOnly: true,
      showHelp: true,
      permLevel: "Moderator",
    });
  }

  async run(reaction, user, level) {
    // eslint-disable-line no-unused-vars
    try {
      if (IgnoredReactions.includes(reaction._emoji.name)) {
        return;
      }
      var starboardData = Object.assign(
        EmptyStarboardData,
        this.client.getGameData(reaction.message.guild, "STARBOARD")
      );
      if (!starboardData.starboardChannel) {
        return;
      }
      if (
        (reaction._emoji == starboardData.starEmoji ||
          starboardData.useAllEmoji) &&
        reaction.count >= starboardData.minimumStarCount
      ) {
        var db = this.client.getDatabase(reaction.message.guild.id);
        const starChan = reaction.message.guild.channels.cache.find(
          (c) => c.id == starboardData.starboardChannelId
        );
        if (
          !starChan ||
          !starChan
            .permissionsFor(this.client.user)
            .has(PermissionsBitField.Flags.SendMessages)
        ) {
          return;
        }

        var starMsg = db.starboardFind(
          reaction.message.id,
          reaction._emoji.name
        );

        const msg = await reaction.message.fetch();
        if (reaction.message.channel.nsfw) {
          msg.attachments = undefined;
          msg.embeds = [];
          msg.content = `[NSFW Post](${msg.url})`;
        }

        var theEmbed = new EmbedBuilder();
        let imageSetSuccessfully = false;

        // Attempt to copy from original embed if it exists and has image data
        // Note: msg.embeds[0].data might be needed for full clone, but here we are rebuilding.
        if (msg.embeds[0] && (msg.embeds[0].image || msg.embeds[0].thumbnail || msg.embeds[0].url )) {
            // If the original embed has image-like qualities, we might prioritize it
            // or simply let resolveAttachment handle it if it's a pure image embed.
            // For now, we'll let the later resolveAttachment logic decide the image,
            // but we can copy other parts of the embed if necessary.
            // Example: theEmbed = new EmbedBuilder(msg.embeds[0].data);
            // However, the current logic rebuilds the embed, so we ensure essential fields are set.
        }

        // Set basic properties
        theEmbed.setColor(15133822); // Same color as before
        theEmbed.setTimestamp(msg.createdAt);
        theEmbed.setAuthor({
          name: msg.member ? msg.member.displayName : msg.author.username,
          icon_url: msg.author.displayAvatarURL(),
          url: msg.url,
        });
        theEmbed.setFooter({ text: `in #${msg.channel.name}` });
        theEmbed.addFields({ name: "Source", value: `[link](${msg.url})` });

        // Resolve and set the image
        const imageToStar = resolveAttachment(msg);
        if (imageToStar) {
          let imageUrl = null;
          if (typeof imageToStar === 'string') { // URL from embed.image or embed.thumbnail
            imageUrl = imageToStar;
          } else if (imageToStar.url) { // MessageAttachment object
            imageUrl = imageToStar.url;
          }

          if (imageUrl) {
            theEmbed.setImage(imageUrl);
            imageSetSuccessfully = true;
          }
        }

        // Set description:
        // Only set description if there is text content.
        // If no text content AND no image was successfully set, then set to "--" as a fallback.
        if (msg.content && msg.content.length > 0) {
          theEmbed.setDescription(msg.content);
        } else if (!imageSetSuccessfully) {
          // If there's no text content and no image could be set,
          // then use "--" to indicate an empty post.
          theEmbed.setDescription("--");
        }
        // If there's no text content BUT an image WAS set,
        // the description will remain unset, which is fine (embed will show image).

        if (!starMsg) {
          var newStarMsg = await starChan.send({
            content: `${
              reaction._emoji.id
                ? "<:" + reaction._emoji.name + ":" + reaction._emoji.id + ">"
                : reaction._emoji
            }x${reaction.count}`,
            embeds: [theEmbed],
          });

          db.starboardAdd({
            message: msg.id,
            starMessage: newStarMsg.id,
            startype: reaction._emoji.name,
          });
        } else {
          var starPost = await starChan.messages.fetch(starMsg.starMessage);

          await starPost.edit({
            content: `${
              reaction._emoji.id
                ? "<:" + reaction._emoji.name + ":" + reaction._emoji.id + ">"
                : reaction._emoji
            }x${reaction.count}`,
            embeds: [theEmbed],
          });
        }
      }
    } catch (e) {
      console.log(e);
      this.client.logger.log(e, "error");
    }
  }
}

module.exports = StarBoardAdd;
