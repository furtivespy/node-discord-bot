const Command = require('../../base/Command.js')
const fetch = require('node-fetch');
const he = require('he')

class Pun extends Command {
    constructor(client){
        super(client, {
            name: "pun",
            description: "Gets a dumb pun.",
            category: "Fun",
            usage: "Type command, get a pun",
            enabled: false,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["puns", "punny", "dumb"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            fetch("https://www.punoftheday.com/cgi-bin/arandompun.pl", { headers: {"Accept": "text/plain"}}).then(res => res.text()).then(text => {
                text = text.slice(22)
                text = text.slice(0, text.indexOf("&quot;<br"))
                const embed = {
                    author: {name: `It's Pun Time!`, icon_url: "https://i.imgur.com/W3WseeN.png"},
                    description: `_${he.decode(text)}_`,
                    color: 6192321
                };
                message.channel.send({embeds: [embed]} );  
            })
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Pun