const Command = require('../../base/Command.js')
const _ = require('lodash')

const mostCommonWords = ["the","of","to","and","a","in","is","it","you","that","he","was","for","on","are","with","as","i","his","they","not","yes",
"be","at","one","have","this","from","or","had","by","hot","word","but","what","some","we","can","out","other","were","all","there","when","oh",
"up","use","your","how","said","an","each","she","which","do","their","time","if","will","way","about","many","then","them","write","would","like",
"so","these","her","long","make","thing","see","him","two","has","look","more","day","could","go","come","did","number","sound","no","most","people",
"my","over","know","water","than","call","first","who","may","down","side","been","now","find","any","new","work","part","take","get","place","ok",
"made","live","where","after","back","little","only","round","man","year","came","show","every","good","me","give","our","under","name","its","i'd",
"very","through","just","form","sentence","great","think","say","help","low","line","differ","turn","cause","much","mean","before","move","it's",
"right","boy","old","too","same","tell","does","set","three","want","air","well","also","play","small","end","put","home","read","hand","port","im",
"large","spell","add","even","land","here","must","big","high","such","follow","act","why","ask","men","change","went","light","kind","off","i'm",
"need","house","picture","try","us","again","animal","point","mother","world","near","build","self","earth","father","head","stand","own","g","gm",
"bender", "got", "still", "yeah", "don't", "going", "i've", "gets"];

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
            var settings = this.client.getSettings(message.guild)
            var wordHistogram = {}
            const responseMsg = await message.channel.send("searching things...")
            message.guild.channels.forEach(async channel => {
                if(channel.type != 'text') return
                await responseMsg.edit(`searching ${channel.name}...`)
                var msgs = await channel.fetchMessages({limit: 100})
                msgs.forEach(msg => {
                    if (msg.author.bot) return
                    if (msg.content.indexOf(settings.prefix) === 0) return;
                    msg.content.toLowerCase().split(/ +/g).forEach(word => {
                        if (mostCommonWords.includes(word)) return
                        if (!isNaN(word)) return
                        
                        wordHistogram[word] = (wordHistogram[word]) ? wordHistogram[word] + 1 : 1
                    })
                })
            });
            await responseMsg.edit(`calculating...`)
            var sorted = Object.keys(wordHistogram).map(c => ({key: c, value: wordHistogram[c]})).sort((a,b) => a.value < b.value)
            var newlist = _.slice(sorted, 0, 200).map(c => c.key).join(" | ")
            
            await responseMsg.edit(`Recent Most Used Words: ${newlist}`)
            
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Test
