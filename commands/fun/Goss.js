const Command = require('../../base/Command.js')
const fetch = require('node-fetch');
var qs = require( 'querystring' );

class Goss extends Command {
    constructor(client){
        super(client, {
            name: "goss",
            description: "Alerts the mooks of goss",
            category: "Fun",
            usage: "\n- works well if followed by single emoji",
            enabled: true,
            guildOnly: true,
            allMessages: false,
            showHelp: true,
            aliases: ["gossip", "mildgoss"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            let announce = (message.command == "mildgoss") ? "Mild goss, Mooks!" : "@here Listen up, Mooks!";

            let input = args.join(" ");
            if (input.length === 0) { input = this.client.emojis.get("543465138997690368") }
            message.channel.send(`${announce} 
${this.client.emojis.get("543465138997690368")}${input}${this.client.emojis.get("543465138997690368")}${input}${this.client.emojis.get("543465138997690368")}${input}${this.client.emojis.get("543465138997690368")}${input}${this.client.emojis.get("543465138997690368")}
${this.client.emojis.get("543465138997690368")}${this.client.emojis.get("543465138997690368")}   GOSS ALERT   ${this.client.emojis.get("543465138997690368")}${this.client.emojis.get("543465138997690368")}
${this.client.emojis.get("543465138997690368")}${input}${this.client.emojis.get("543465138997690368")}${input}${this.client.emojis.get("543465138997690368")}${input}${this.client.emojis.get("543465138997690368")}${input}${this.client.emojis.get("543465138997690368")}`)
        } catch (e) {
            this.client.logger.log(e,'error');
        }
    }
}

module.exports = Goss