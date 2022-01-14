const Command = require('../../base/Command.js')
const fetch = require('node-fetch');
const Emoji = require('../../modules/EmojiAssistant.js')
const Discord = require('discord.js')


class Drink extends Command {
    constructor(client){
        super(client, {
            name: "drink",
            description: "Look up a drink recipe",
            category: "Fun",
            usage: "\n- command followed by a search term",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["cocktail", "drinks", "cocktails"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            var query = new URLSearchParams()
            if (!args || args.length == 0) {
                query.set('s', 'margarita')
            } else {
                query.set('s', args.join(" "));
            }
            let res = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?${query.toString()}`)
            let json = await res.json()
            if (json.drinks){
                let theDrink = json.drinks[0]
                if (json.drinks.length > 1) {
                    const drinkChoice = new Discord.MessageEmbed().setColor(13928716).setTitle(`Select a Drink`)
                    let drinkList = ""
                    for (let i = 0; i <json.drinks.length && i < 10; i++) {
                        drinkList += `${Emoji.IndexToEmoji(i)}:arrow_right:  ${json.drinks[i].strDrink}\n`
                    }
                    drinkChoice.setDescription(drinkList)
                    let msg = await message.channel.send(drinkChoice)
                    for (let i = 0; i < json.drinks.length && i < 10; i++) {
                        await msg.react(Emoji.IndexToEmoji(i))
                    }
                    try {
                        var drinkReaction = await msg.awaitReactions((reaction, user) => user.id == message.author.id
                            && (reaction.emoji.name == '1️⃣' || reaction.emoji.name == '2️⃣' || reaction.emoji.name == '3️⃣' || reaction.emoji.name == '4️⃣' || reaction.emoji.name == '5️⃣'
                             || reaction.emoji.name == '6️⃣' || reaction.emoji.name == '7️⃣' || reaction.emoji.name == '8️⃣' || reaction.emoji.name == '9️⃣' || reaction.emoji.name == '🔟'),
                            { max: 1, time: 60000 })
                    } catch {
                        drinkReaction = {}
                    }
            
                    if (!drinkReaction.first()){
                        await msg.edit(`No reaction after 60 seconds, ${actionName} canceled - try again when ready`);
                        await msg.suppressEmbeds(true)
                        return undefined
                    }
                    theDrink = json.drinks[Emoji.EmojiToIndex(drinkReaction.first().emoji.name)]
                    msg.delete()
                }   
                const drinkDetail = new Discord.MessageEmbed().setColor(13928716).setTitle(theDrink.strDrink).setImage(theDrink.strDrinkThumb)
                let ingredients = ""
                for (let i = 1; i < 16; i++) {
                    if (theDrink[`strMeasure${i}`] == null && theDrink[`strIngredient${i}`] == null) {
                        break
                    }
                    ingredients += `${theDrink[`strMeasure${i}`]} ${theDrink[`strIngredient${i}`]}\n`
                }
                drinkDetail.addField(`Ingredients`, ingredients)
                drinkDetail.addField(`Instrctions`, theDrink.strInstructions)

                await message.channel.send(drinkDetail)

            } else {
                await message.reply(`I couldn't find anyting for ${args.join(" ")}`)
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }

    
}

module.exports = Drink