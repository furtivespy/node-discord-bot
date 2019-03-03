const Command = require('../../base/Command.js')

class Ping extends Command {
    constructor(client){
        super(client, {
            name: "ping",
            description: "Get's Bender's Ping.",
            category: "Utility",
            usage: "Use this command to make sure the bot is still there and responding",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["pong", "pingpong"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            const m = await message.channel.send("Ping?");
            m.edit(`Pong! Latency is ${m.createdTimestamp - message.createdTimestamp}ms. API Latency is ${Math.round(this.client.ping)}ms`);
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Ping