const Command = require('../../base/Command.js')
const fetch = require('node-fetch');

class DadJoke extends Command {
    constructor(client){
        super(client, {
            name: "dadjoke",
            description: "Tells a dad joke.",
            category: "Fun",
            usage: "Type command, get a dad joke",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["daddy", "father", "daddyjoke", "jokedad", "fatherjoke", "dad", "littledad"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            fetch("https://icanhazdadjoke.com/", { headers: {"Accept": "text/plain"}}).then(res => res.text()).then(text => {
                const embed = {
                    author: {name: `${message.guild.members.get(this.client.user.id).displayName}'s Dad Says:`, icon_url: "https://i.imgur.com/W3WseeN.png"},
                    description: `_${text}_`,
                    color: 6192321
                };
                message.channel.send({embed: embed} );  
            })
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = DadJoke