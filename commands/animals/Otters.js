const Command = require("../../base/Command.js");

class Otter extends Command {
  constructor(client) {
    super(client, {
      name: "otter",
      description: "This is where the Otters are",
      category: "Animals",
      usage: "Type command, get an otter fact and an otter picture",
      enabled: true,
      guildOnly: false,
      allMessages: false,
      showHelp: true,
      aliases: ["otters"],
      permLevel: "User",
    });
  }

  async run(message, args, level) {
    try {
      message.reply({
        content:
          "The otters command is now deprecated. Please use the `/random otter` command instead.",
      });
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }
}

module.exports = Otter;
