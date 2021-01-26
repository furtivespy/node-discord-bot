const Command = require("../../base/Command.js");
const fetch = require("node-fetch");
var parser = require('fast-xml-parser');
const _ = require('lodash')

class Rule34 extends Command {
  constructor(client) {
    super(client, {
      name: "rule34",
      description: "WTF? Why?",
      category: "NSFW",
      usage: "Use followed by a search term to get a weird Rule34 image",
      enabled: true,
      guildOnly: false,
      allMessages: false,
      showHelp: true,
      aliases: ["34"],
      permLevel: "User"
    });
  }

  async run(message, args, level) {
    // eslint-disable-line no-unused-vars
    try {
      if (!message.channel.nsfw)
        return message.channel.send(
          "🔞 Cannot display NSFW content in a SFW channel."
        );
      var searchTerm = args.join("_");
      const msg = await message.channel.send(
        `**${message.member.displayName}** is looking for weird shit...`
      );
      fetch(
        `https://rule34.xxx/index.php?page=dapi&s=post&q=index&limit=20&tags=${searchTerm}`
      )
        .then(res => res.text())
        .then(async body => {
          //console.log(body)
          var tObj = parser.parse(body, {
            ignoreAttributes: false,
            attributeNamePrefix: ""
          });
          var post = _.sample(tObj.posts.post);
          if (post === undefined || post.file_url === undefined) {
            return await msg.edit("too weird, couldn't find anything")
          }
          await msg.edit({
            embed: {
              title: "Click here if the image failed to load.",
              url: `${post.file_url}`,
              color: 9234325,
              image: {
                url: `${post.file_url}`
              },
              footer: {
                icon_url: message.author.displayAvatarURL(),
                text: `Requested by ${
                  message.author.tag
                } | Powered by rule34.xxx`
              }
            }
          });
        });
    } catch (e) {
      this.client.logger.log(e, "error");
      message.channel.send(clean(e));
    }
  }
}

module.exports = Rule34;
