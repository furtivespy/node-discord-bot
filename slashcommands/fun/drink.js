const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');
const fetch = require('node-fetch');
const { MessageEmbed, MessageActionRow, MessageSelectMenu } = require('discord.js');

class Drink extends SlashCommand {
    constructor(client){
        super(client, {
            name: "drink",
            description: "Search for a cocktail recipe",
            usage: "Find a cocktail",
            enabled: true,
            permLevel: "User"
          })
        this.data = new SlashCommandBuilder()
            .setName(this.help.name)
            .setDescription(this.help.description)
            .addStringOption(option => option.setName('search').setDescription('The drink search term').setRequired(true))
    }

    async execute(interaction) {
        try {
            var query = new URLSearchParams()
            query.set('s', interaction.options.getString('search'))
            let res = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?${query.toString()}`)
            let json = await res.json()
            if (json.drinks){
                let theDrink = json.drinks[0]
                let rply = null
                if (json.drinks.length > 1) {

                    let options = []

                    for (let i = 0; i < json.drinks.length; i++) {
                        options.push({
                            label: json.drinks[i].strDrink,
                            value: i.toString()
                        })         
                    }

                    const row = new MessageActionRow()
                    .addComponents(
                        new MessageSelectMenu()
                            .setCustomId('select')
                            .setPlaceholder('Nothing selected')
                            .addOptions(options),
                    );

                    rply = await interaction.reply({ 
                        content: `Multiple results for ${interaction.options.getString('search')}`, 
                        components: [row],
                        ephemeral: true,
                        fetchReply:  true
                    })
                    const filter = (int) => int.customId === 'select'
                    let newInteraction = await rply.awaitMessageComponent({ filter, time: 60_000 }).catch(err => this.client.logger.log(err,'error'))

                    if (newInteraction) {
                        const val = parseInt(newInteraction.values[0])
                        theDrink = json.drinks[val]
                        newInteraction.update({
                            content: json.drinks[val].strDrink,
                            components: []
                          })
                    } else {
                        rply.delete()
                        return
                    }
                    
                    /*
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
                    */
                } 
                 
                const drinkDetail = new MessageEmbed().setColor(13928716).setTitle(theDrink.strDrink).setImage(theDrink.strDrinkThumb)
                let ingredients = ""
                for (let i = 1; i < 16; i++) {
                    if (theDrink[`strMeasure${i}`] == null && theDrink[`strIngredient${i}`] == null) {
                        break
                    }
                    ingredients += `${theDrink[`strMeasure${i}`]} ${theDrink[`strIngredient${i}`]}\n`
                }
                drinkDetail.addField(`Ingredients`, ingredients)
                drinkDetail.addField(`Instrctions`, theDrink.strInstructions)

                if (rply){
                    //await interaction.editReply({ content: 'Selected', components: [] })
                    await interaction.followUp({ embeds: [drinkDetail] })
                    
                } else {
                    await interaction.reply({ embeds: [drinkDetail] })
                }
                

            } else {
                await interaction.reply({ content: `I couldn't find anyting for ${interaction.options.getString('search')}`, ephemeral: true})
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Drink