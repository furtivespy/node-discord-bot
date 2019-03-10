const Command = require('../../base/Command.js')
const _ = require('lodash');
var AsciiTable = require('ascii-table')

const EmptyBringoData = {
    wordlist: [],
    isGameActive: false,
    currentGame: [],
    scoreboard: {}
}

const WinningPositions = [
    [0,1,2,3,4],
    [5,6,7,8,9],
    [10,11,12,13,14],
    [15,16,17,18,19],
    [20,21,22,23,24],
    [0,5,10,15,20],
    [1,6,11,16,21],
    [2,7,12,17,22],
    [3,8,13,18,23],
    [4,9,14,19,24],
    [0,6,12,18,24],
    [4,8,12,16,20],
]

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

const showboard = (BringoData) => {
    var table = new AsciiTable('BRINGO')
    var row = []
    for(let i=0; i < 25; i++){
        row.push((BringoData.currentGame[i].isFound) ? BringoData.currentGame[i].word : "*****")
        if ((i%5) === 4) { 
            table.addRow(row)
            row = []
        }
    }
    table.setAlignCenter(1)
    table.setAlignCenter(2)
    table.setAlignCenter(3)
    table.setAlignCenter(4)
    table.setAlignCenter(5)
    return table.toString()
}

class Bringo extends Command {
    constructor(client){
        super(client, {
            name: "bringo",
            description: "Start a Bringo Game!",
            category: "Games",
            usage: `Here are some Bringo Commands:
= All Users =
    !Bringo         :: Just shows the current game's board
    !Bringo start   :: starts a new game of bringo (if there isn't already one)
    !Bringo score   :: gets the scoreboard
= Admin Only commands =
    !Bringo add word                  :: Adds a word to the list of possibilies
    !Bringo add word|another thing    :: Use pipe to add multiple
    !Bringo remove word               :: removes a word from the list of possibilites
    !Bringo remove word|another thing :: Use pipe to remove multiple
= Server Owner only Commands =
    !Bringo clearallwords :: deletes the whole word list
    !Bringo suggestions   :: searches recent messages for often used words`,
            enabled: true,
            guildOnly: true,
            allMessages: true,
            showHelp: true,
            aliases: ["bingo"],
            permLevel: "User"
          })
    }

    startBringo (BringoData) {
        console.log('starting Game...')
        var newGame = _.sampleSize(BringoData.wordlist, 24)
        newGame.splice(12,0,"BRINGO!");
        var fullGame = []
        _.forEach(newGame, (word, ix) => {
            fullGame.push({"word": word, "isFound": (ix === 12), "FoundBy": null })
        })
        BringoData.currentGame = fullGame
        BringoData.isGameActive = true
        console.log(BringoData)
        return BringoData
    }

    async run (message, args, level) {
        try {
            var BringoData = Object.assign(EmptyBringoData, this.client.getGameData(message.guild, 'BRINGO'))

            //Was this a command call?
            if(message.command && (message.command == "bringo" || message.command == "bingo")) {
                //Any arrguments on this call    
                if (args[0] && args[0].toLowerCase() === "start"){
                    if (BringoData.isGameActive) {
                        return message.reply("A game is already happening!");
                        
                    } else {
                        if (BringoData.wordlist.length > 25) {
                            BringoData = this.startBringo(BringoData)
                            this.client.setGameData(message.guild, 'BRINGO', BringoData)
                            message.reply("YOUR BRINGO GAME HAS STARTED!!!")
                        } else
                            return message.reply("tell the admin to add some words!")
                    }
                } else if (args[0] && args[0].toLowerCase() === "score"){
                    var sorted = Object.keys(BringoData.scoreboard).map(c => ({key: c, value: BringoData.scoreboard[c]})).sort((a,b) => a.value < b.value)
                    var scoreMessage = ""
                    for(let i=0;i<sorted.length;i++){
                        var icon = (i===0) ? ":first_place:" : (i===1) ? ":second_place:" : (i===2) ? ":third_place:" : ":medal:"
                        scoreMessage += `${icon} ${sorted[i].value} :: ${message.guild.members.get(sorted[i].key).displayName}\n`
                    }
                    await message.channel.send({embed: { color: 13207824, 
                        title: "Bringo Scoreboard",
                        description: scoreMessage 
                    }})
                } else if (args[0] && args[0].toLowerCase() === 'add' && level >= 3) {
                    if (args.length === 1) {
                        await message.channel.send("use the add command to add words to the possible boards");
                        await message.channel.send(`ex. \`${message.settings.prefix}bringo add helicopter\``);
                        await message.channel.send(`add multiple with pipe separator. \`${message.settings.prefix}bringo add bingo | bango | bongo\``);
                    } else {
                        args.shift()
                        var additives = args.join(" ").toLowerCase().split(/ *\| */g);
                        BringoData.wordlist = _.uniq(_.concat(BringoData.wordlist,additives))
                        this.client.setGameData(message.guild, 'BRINGO', BringoData)
                        return message.reply(`I added ${additives.length} word${(additives.length ===  1)? '' : 's'}`)
                    }
                } else if (args[0] && args[0].toLowerCase() === 'remove' && level >= 3) {
                    if (args.length === 1) {
                        await message.channel.send("use the remove command to remove words from the possible boards");
                        await message.channel.send(`ex. \`${message.settings.prefix}bringo remove helicopter\``);
                        await message.channel.send(`remove multiple with pipe separator. \`${message.settings.prefix}bringo remove bingo | bango | bongo\``);
                    } else {
                        args.shift()
                        var additives = args.join(" ").toLowerCase().split(/ *\| */g);
                        BringoData.wordlist = _.difference(BringoData.wordlist,additives)
                        this.client.setGameData(message.guild, 'BRINGO', BringoData)
                        return message.reply(`I removed ${additives.length} word${(additives.length ===  1)? '' : 's'}`)
                    }
                } else if (args[0] && args[0].toLowerCase() === 'suggestions' && level >= 4) {
                    var wordHistogram = {}
                    const responseMsg = await message.channel.send("searching things...")
                    message.guild.channels.forEach(async channel => {
                        if(channel.type != 'text') return
                        await responseMsg.edit(`searching ${channel.name}...`)
                        var msgs = await channel.fetchMessages({limit: 100})
                        msgs.forEach(msg => {
                            if (msg.author.bot) return
                            if (msg.content.indexOf(message.settings.prefix) === 0) return;
                            msg.content.toLowerCase().split(/ +/g).forEach(word => {
                                if (mostCommonWords.includes(word)) return
                                if (BringoData.wordlist.includes(word)) return
                                if (!isNaN(word)) return
                                
                                wordHistogram[word] = (wordHistogram[word]) ? wordHistogram[word] + 1 : 1
                            })
                        })
                    });
                    await responseMsg.edit(`calculating...`)
                    var sorted = Object.keys(wordHistogram).map(c => ({key: c, value: wordHistogram[c]})).sort((a,b) => a.value < b.value)
                    var newlist = _.slice(sorted, 0, 200).map(c => c.key).join(" | ")
                    
                    await responseMsg.edit(`Recent Most Used Words: ${newlist}`)
                }else if (args[0] && args[0].toLowerCase() === 'clearallwords' && level >= 4) {
                    BringoData.wordlist = []
                    this.client.setGameData(message.guild, 'BRINGO', BringoData)
                    return message.reply(`I removed every word :(`)
                } else {
                    if (BringoData.isGameActive) {
                    //Display Board
                    await message.channel.send("```" + showboard(BringoData) + "```")
                    } else {
                        await message.channel.send("No game is happening!");
                    }
                }
            //not a command, so do checks
            } else {
                if (BringoData.isGameActive) {
                    //Check for a match!
                    var matched = []
                    var messageText = message.content.trim().toLowerCase()
                    for(let i=0;i<25;i++){
                        if(!BringoData.currentGame[i].isFound && _.includes(messageText, BringoData.currentGame[i].word)){
                            BringoData.currentGame[i].isFound = true
                            BringoData.currentGame[i].FoundBy = message.author.id
                            this.client.setGameData(message.guild, 'BRINGO', BringoData)
                            await message.reply(`you found ${BringoData.currentGame[i].word}`)
                            _.forEach(WinningPositions, async winner => {
                                if(BringoData.currentGame[winner[0]].isFound && 
                                    BringoData.currentGame[winner[1]].isFound && 
                                    BringoData.currentGame[winner[2]].isFound && 
                                    BringoData.currentGame[winner[3]].isFound && 
                                    BringoData.currentGame[winner[4]].isFound){
                                        //score it
                                        BringoData.scoreboard[message.author.id] = (BringoData.scoreboard[message.author.id]) ? BringoData.scoreboard[message.author.id] + 1 : 1
                                        if(winner[0]!=12) BringoData.scoreboard[BringoData.currentGame[winner[0]].FoundBy] = (BringoData.scoreboard[BringoData.currentGame[winner[0]].FoundBy]) ? BringoData.scoreboard[BringoData.currentGame[winner[0]].FoundBy] + 1 : 1
                                        if(winner[1]!=12) BringoData.scoreboard[BringoData.currentGame[winner[1]].FoundBy] = (BringoData.scoreboard[BringoData.currentGame[winner[1]].FoundBy]) ? BringoData.scoreboard[BringoData.currentGame[winner[1]].FoundBy] + 1 : 1
                                        if(winner[2]!=12) BringoData.scoreboard[BringoData.currentGame[winner[2]].FoundBy] = (BringoData.scoreboard[BringoData.currentGame[winner[2]].FoundBy]) ? BringoData.scoreboard[BringoData.currentGame[winner[2]].FoundBy] + 1 : 1
                                        if(winner[3]!=12) BringoData.scoreboard[BringoData.currentGame[winner[3]].FoundBy] = (BringoData.scoreboard[BringoData.currentGame[winner[3]].FoundBy]) ? BringoData.scoreboard[BringoData.currentGame[winner[3]].FoundBy] + 1 : 1
                                        if(winner[4]!=12) BringoData.scoreboard[BringoData.currentGame[winner[4]].FoundBy] = (BringoData.scoreboard[BringoData.currentGame[winner[4]].FoundBy]) ? BringoData.scoreboard[BringoData.currentGame[winner[4]].FoundBy] + 1 : 1
                                        //GAME OVER MAN!
                                        BringoData.isGameActive = false;
                                        
                                    }
                            })
                            if(!BringoData.isGameActive) {
                                await message.channel.send("```" + showboard(BringoData) + "```")
                                await message.channel.send({embed: { "image": {
                                    "url": "https://media.giphy.com/media/xLsaBMK6Mg8DK/giphy.gif"
                                    } }})
                                this.client.setGameData(message.guild, 'BRINGO', BringoData)
                            }
                        }
                    }
                }
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Bringo
