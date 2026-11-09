import SlashCommand from '../../base/SlashCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';

const COLLECTOR_MS = 60_000;
const UNKNOWN_MESSAGE = 10008;

export function isCollectorEnd(error) {
    return error?.code === 'InteractionCollectorError';
}

export function isUnknownMessage(error) {
    return error?.code === UNKNOWN_MESSAGE;
}

export async function dismissTimedOutReply(interaction) {
    try {
        await interaction.editReply({ content: 'Timed out', components: [] });
    } catch (error) {
        if (!isUnknownMessage(error)) throw error;
    }
}

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

                    const row = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('select')
                            .setPlaceholder('Nothing selected')
                            .addOptions(options),
                    );

                    rply = await interaction.reply({ 
                        content: `Multiple results for ${interaction.options.getString('search')}`, 
                        components: [row],
                        ephemeral: true
                    })
                    const filter = (int) => int.customId === 'select'
                    let newInteraction
                    try {
                        newInteraction = await rply.awaitMessageComponent({ filter, time: COLLECTOR_MS })
                    } catch (err) {
                        if (isCollectorEnd(err)) {
                            await dismissTimedOutReply(interaction)
                            return
                        }
                        throw err
                    }

                    const val = parseInt(newInteraction.values[0])
                    theDrink = json.drinks[val]
                    await newInteraction.update({
                        content: json.drinks[val].strDrink,
                        components: []
                      })
                } 
                 
                const drinkDetail = new EmbedBuilder().setColor(13928716).setTitle(theDrink.strDrink).setImage(theDrink.strDrinkThumb)
                let ingredients = ""
                for (let i = 1; i < 16; i++) {
                    if (theDrink[`strMeasure${i}`] == null && theDrink[`strIngredient${i}`] == null) {
                        break
                    }
                    ingredients += `${theDrink[`strMeasure${i}`]} ${theDrink[`strIngredient${i}`]}\n`
                }
                drinkDetail.addFields({name: `Ingredients`, value: ingredients})
                drinkDetail.addFields({name: `Instructions`, value: theDrink.strInstructions})

                if (rply){
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

export default Drink
