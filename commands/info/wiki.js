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
        message.reply({
            content: "The Wiki command is now deprecated. Please use the `/wiki` command instead.",
        })
    } catch (e) {
        this.client.logger.log(e,'error');
    }
  }
}

module.exports = Wiki;
