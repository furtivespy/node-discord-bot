const Command = require('../../base/Command.js')
const fetch = require('node-fetch');
var qs = require( 'querystring' );

class Chuck extends Command {
    constructor(client){
        super(client, {
            name: "chuck",
            description: "Shows the power of Chuck Norris",
            category: "Fun",
            usage: "\n- Command by itself, get's fact about Chuck Norris\n- Command followed by a name will put that name into the fact",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["chucknorris", "norris", "dennis"],
            permLevel: "User"
          })
    }

    async run (message, [first, ...rest], level) {
        try {
            var query;
            if (!first && message.command == 'dennis') {
                query = qs.stringify( {escape: 'javascript', firstName: "Dennis", lastName: null});
            } else if (!first) {
                query = "escape=javascript";
            } else {
                query = qs.stringify( {escape: 'javascript', firstName: first, lastName: rest.join(" ")});
            }
            fetch('http://api.icndb.com/jokes/random?' + query).then(res => res.json()).then(json => {
                message.channel.send(json.value.joke.replace(/  /g, " "))
            })
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Chuck