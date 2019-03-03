const Command = require('../../base/Command.js')

class Nickname extends Command {
    constructor(client){
        super(client, {
            name: "nickname",
            description: "Update Bot's nickname",
            category: "Utility",
            usage: "This command will give the bot a new nickname on your server",
            enabled: true,
            guildOnly: true,
            allMessages: false,
            showHelp: true,
            aliases: ["nick"],
            permLevel: "Administrator"
          })
    }

    async run (message, args, level) {
        try {
            var newName = args.join(" ")
            message.react('⚡')
            message.guild.members.get(this.client.user.id).setNickname(newName)
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Nickname
