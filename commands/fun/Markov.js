const Command = require('../../base/Command.js')
const database =  require('../../db/db.js')

class Markov extends Command {
    constructor(client){
        super(client, {
            name: "markov",
            description: "Make Bender speak.",
            category: "Fun",
            usage: "Use command followed by 3, 4, or 5 to build a markov chain with that size ngram",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["chain"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            message.delete().catch(O_o=>{}); 
            var db = new database(message.guild.id)
            var words = db.makeSentence(args[0])
            message.channel.send(words)
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Markov