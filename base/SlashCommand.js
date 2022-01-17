

class SlashCommand {
    constructor(client, {
      name = null,
      description = "No description provided.",
      usage = "No usage provided.",
      enabled = true,
      permLevel = "User"
    }) {
      this.client = client;
      this.conf = { enabled, permLevel };
      this.help = { name, description, usage };
    }


    
  }
  module.exports = SlashCommand;