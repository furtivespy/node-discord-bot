const Command = require('../../base/Command.js')

class Test extends Command {
    constructor(client){
        super(client, {
            name: "test",
            description: "Whatever Will is currently Testing",
            category: "Utility",
            usage: "Does something different every time",
            enabled: true,
            guildOnly: true,
            allMessages: false,
            showHelp: true,
            aliases: ["t"],
            permLevel: "Bot Owner"
          })
    }

    async run (message, args, level) {
        try {
            message.react('⚡')

            var scoreobject = {}

            scoreobject['543061837122502668'] = (Math.floor(Math.random() * 35) + 1)
            scoreobject['550022115529588767'] = (Math.floor(Math.random() * 35) + 1)
            scoreobject['363902314609770517'] = (Math.floor(Math.random() * 35) + 1)
            scoreobject['262764002789031946'] = (Math.floor(Math.random() * 35) + 1)
            scoreobject['95591819399659520'] = (Math.floor(Math.random() * 35) + 1)
            scoreobject['84025085047869440'] = (Math.floor(Math.random() * 35) + 1)

            var sorted = Object.keys(scoreobject).map(c => ({key: c, value: scoreobject[c]})).sort((a,b) => a.value < b.value)
            var scoreMessage = ""
            for(let i=0;i<sorted.length;i++){
                var icon = (i===0) ? ":first_place:" : (i===1) ? ":second_place:" : (i===2) ? ":third_place:" : ":medal:"
                scoreMessage += `${icon} ${sorted[i].value} :: ${message.guild.members.get(sorted[i].key).displayName}\n`
            }
            await message.channel.send({embed: { color: 13207824, 
                title: "Bringo Scoreboard",
                description: scoreMessage 
            }})
            
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Test
