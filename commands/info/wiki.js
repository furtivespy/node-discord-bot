const Command = require("../../base/Command.js");
const fetch = require("node-fetch");
const wtf = require("wtf_wikipedia");
const SampleSize = require("lodash/sampleSize");

class Wiki extends Command {
  constructor(client) {
    super(client, {
      name: "wiki",
      description: "Searches Wikipedia",
      category: "Info",
      usage:
        "Command followed by what you'd like to searh for, e.g. '!wiki Albert Einstein' ",
      enabled: true,
      guildOnly: false,
      allMessages: false,
      showHelp: true,
      aliases: ["wikipedia", "info", "wikia", "information"],
      permLevel: "User",
    });
  }

  async run(message, args, level) {
    try {
      let query = new URLSearchParams();
      query.set("action", "opensearch");
      query.set("format", "json");
      query.set("limit", 1);
      query.set("search", args.join(" "));
      fetch(`https://en.wikipedia.org/w/api.php?${query.toString()}`)
        .then((res) => res.json())
        .then((searchResults) => {
          if (searchResults[1].length > 0) {
            wtf.extend(require("wtf-plugin-markdown"));
            wtf.fetch(searchResults[1][0]).then((doc) => {
              if (doc.isDisambiguation()) {
                let somelinks = SampleSize(doc.links(), 6);
                let links = "";
                somelinks.forEach((item) => {
                  links += `\n * ${item.page()}`;
                });
                message.channel.send(
                  `Too many ${searchResults[0]} results. Try being more specific with "(film)" or "(album)" or something like:${links}`
                );
              } else {
                let description = doc.section(0).markdown();
                description = description.replace(
                  /(\(.\/)/gm,
                  "(https://en.wikipedia.org/wiki/"
                );
                message.channel.send({
                  embeds: [
                    {
                      author: { name: doc.title(), url: searchResults[3][0] },
                      description: description.substring(0, 2040),
                      color: 13749966,
                      thumbnail: {
                        url: doc.images()[0] ? doc.images()[0].url() : "",
                      },
                    },
                  ],
                });
              }
            });
          } else {
            message.channel.send(
              "Couldn't find any info on " + searchResults[0]
            );
          }
        });
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }
}

module.exports = Wiki;
