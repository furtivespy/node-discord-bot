const Command = require('../../base/Command.js')

class Status extends Command {
    constructor(client){
        super(client, {
            name: "status",
            description: "Update Bot's Status - across all servers",
            category: "Utility",
            usage: "Use this command followed by whatever it should say after 'Playing' for the bot",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["playing"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            this.client.config.activity = args.join(" ")
            message.react('⚡')
            this.client.user.setActivity(this.client.config.activity);
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Status
