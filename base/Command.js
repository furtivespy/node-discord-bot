class Command {
    constructor(client, {
      name = null,
      description = "No description provided.",
      category = "Miscellaneous",
      usage = "No usage provided.",
      enabled = true,
      guildOnly = false,
      allMessages = false,
      showHelp = false,
      aliases = new Array(),
      permLevel = "User"
    }) {
      this.client = client;
      this.conf = { enabled, guildOnly, aliases, permLevel, allMessages, showHelp };
      this.help = { name, description, category, usage };
    }
  }
  module.exports = Command;