const Command = require('../../base/Command.js')
const _ = require('lodash');
var AsciiTable = require('ascii-table')

const baseBringo = {
    "rows": [["","","","",""],["","","","",""],["","","","",""],["","","","",""],["","","","",""]]
  }

const showboard = (game) => {
    var table = new AsciiTable('BRINGO')
    for(let i =0; i < 5; i++){
        table.addRow(
            game.rows[i][0].isFound ? game.rows[i][0].word : "*****",
            game.rows[i][1].isFound ? game.rows[i][1].word : "*****",
            game.rows[i][2].isFound ? game.rows[i][2].word : "*****",
            game.rows[i][3].isFound ? game.rows[i][3].word : "*****",
            game.rows[i][4].isFound ? game.rows[i][4].word : "*****"
        )
    }
    return table.toString()
}

class Bringo extends Command {
    constructor(client){
        super(client, {
            name: "bringo",
            description: "Start a Bringo Game!",
            category: "Games",
            usage: `"bringo start" to start game, "bringo" to get current board`,
            enabled: false,
            guildOnly: true,
            allMessages: true,
            showHelp: true,
            aliases: ["bingo"],
            permLevel: "User"
          })
    }

    startBringo (message) {
        console.log('starting Game...')
        if(!this.client.settings.get(message.guild.id).bringoWordList || this.client.settings.get(message.guild.id).bringoWordList.length < 24)
            return

        var newGame = _.sampleSize(this.client.settings.get(message.guild.id).bringoWordList, 24);
        newGame.splice(13,0,"FREE!");
        var fullGame = baseBringo
        _.forEach(newGame, (word, ix) => {
            var rowNum = Math.floor(ix/5);
            fullGame.rows[rowNum][ix%5] = {"word": word, "isFound": (ix === 13) }
        })

        this.client.settings.set(message.guild.id, true, "isInBringoGame")
        this.client.settings.set(message.guild.id, fullGame, "bringoGame")

        console.log(fullGame)
    }

    async run (message, args, level) {
        try {
            if (!this.client.settings.has(message.guild.id)) this.client.settings.set(message.guild.id, {});
           
            if(message.command && (message.command == "bringo" || message.command == "bingo")) {
                if (args[0] && args[0].toLowerCase() === "start"){
                    if (this.client.settings.get(message.guild.id).isInBringoGame) {
                        await message.channel.send("A game is already happening!");
                    } else {
                        this.startBringo(message)
                    }
                } else {
                    if (this.client.settings.get(message.guild.id).isInBringoGame) {
                    //Display Board
                    var currentGame = this.client.settings.get(message.guild.id).bringoGame
                    
                    await message.channel.send("```" + showboard(currentGame) + "```")
                    } else {
                        await message.channel.send("No game is happening!");
                    }
                }
            } else {
                //Check for a match!
                var currentGame = this.client.settings.get(message.guild.id).bringoGame
                let i = 0, j = 0
                outerloop:
                for(i=0; i < 5; i++){
                    for(j=0; j < 5; j++){
                        if (!currentGame.rows[i][j].isFound && args.has(currentGame.rows[i][j].word))
                            break outerloop
                    }
                }
                if (i < 5 && j < 5) {
                    currentGame.rows[i][j].isFound = true;
                    this.client.settings.set(message.guild.id, currentGame, "bringoGame")
                    await message.channel.send("```" + showboard(currentGame) + "```")
                }

            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Bringo
