const Command = require('../../base/Command.js')

class Markov extends Command {
    constructor(client){
        super(client, {
            name: "markov",
            description: "Make Bender speak.",
            category: "Fun",
            usage: "Use command followed by a single word, then bender starts a chain with that word",
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
            var db = this.client.getDatabase(message.guild.id)
            if (args[0] == "train" && level >= 7) {
                message.delete().catch(O_o=>{}); 
                var snowflake = args[1]
                for(var i=0;i<50;i++){
                    var msgs = await message.channel.messages.fetch({limit: 50, before: snowflake})
                    console.log(`${i}) training ${msgs.size} phrases`)
                    if (msgs.size < 49) i = 101
                    msgs.forEach(msg => {
                        if (msg.author.bot) return
                        if (msg.content.indexOf(message.settings.prefix) === 0) return;
                        db.markovInput(msg.content.trim().toLowerCase())
                        snowflake = msg.id
                    })
                }
                console.log(`done training at ${snowflake}`)
            } else {
                message.delete().catch(O_o=>{}); 
                var words = db.makeSentence(message.settings.markovLevel, args[0])
                message.channel.send(words)
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Markov