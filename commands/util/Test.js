const Command = require('../../base/Command.js')
const fetch = require('node-fetch')
const he = require('he')
const _ = require('lodash')
const database =  require('../../db/db.js')

const clean = text => {
    if (typeof(text) === "string")
      return text.replace(/`/g, "`" + String.fromCharCode(8203)).replace(/@/g, "@" + String.fromCharCode(8203)).substring(0,1998);
    else
        return text;
  }

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
            //message.channel.send('Testing...')
            var db = new database(message.guild.id)
            var count3 = db.db.prepare("select count(*) as rows from trigram")
            var count4 = db.db.prepare("select count(*) as rows from quadgram")
            var count5 = db.db.prepare("select count(*) as rows from quingram")

           
            message.channel.send(`DB STATS: trigrams - ${count3.get().rows} | quadgrams - ${count4.get().rows} | quingrams - ${count5.get().rows}`)
        } catch (e) {
           this.client.logger.log(e,'error')
           message.channel.send(clean(e))
        }
    }
}

module.exports = Test
