const Command = require('../../base/Command.js')
const fetch = require('node-fetch');
var qs = require( 'querystring' );

class Slogan extends Command {
    constructor(client){
        super(client, {
            name: "slogan",
            description: "Come up with a cool slogan",
            category: "Fun",
            usage: "slogan <Thing to be sloganized>",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["adage", "motto"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            var query;
            if (!args || args.length == 0) {
                query = "slogan=Robots";
            } else {
                query = qs.stringify( {slogan: args.join(" ")});
            }
            fetch('http://www.sloganizer.net/en/outbound.php?' + query).then(res => res.text()).then(body => {
                message.channel.send(body.replace(/<.*?>/g,''))
            })
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Slogan