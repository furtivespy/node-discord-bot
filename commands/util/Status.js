const Command = require('../../base/Command.js')

class Status extends Command {
    constructor(client){
        super(client, {
            name: "status",
            description: "Update Bot's Status - across all servers",
            category: "Utility",
            usage: "Use this command followed by whatever it should say for the bot's status\ndiscord supports streaming, listening, watching and playing - it will default to playing if you don't start the new status with that",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: [],
            permLevel: "User"
          })
    }

    async run (message, [type, ...args], level) {
        try {
            if (!type || type === "") return;
            var activityType = "PLAYING"
            var newActivty = ""
            switch (type.toLowerCase()){
                case "stream":
                case "streaming":
                    activityType = "STREAMING"
                    newActivty = args.join(" ")
                    break
                case "listen":
                case "listening":
                    activityType = "LISTENING"
                    newActivty = args.join(" ")
                    break
                case "watch":
                case "watching": 
                    activityType = "WATCHING"
                    newActivty = args.join(" ")
                    break
                case "play":
                case "playing":
                    activityType = "PLAYING"
                    newActivty = args.join(" ")
                    break;
                default:
                    activityType = "PLAYING"
                    newActivty = type + " " + args.join(" ")
            }
            this.client.config.activity = newActivty
            this.client.config.activityType = activityType
            message.react('⚡')
            this.client.user.setActivity(this.client.config.activity, { type: activityType });
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Status
