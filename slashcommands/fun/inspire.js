import SlashCommand from '../../base/SlashCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from 'discord.js';

export const INSPIRE_URL = 'https://inspirobot.me/api?generate=true';
export const INSPIRE_UNAVAILABLE = "Couldn't reach inspirobot right now.";

function isHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

class Inspire extends SlashCommand {
    constructor(client){
        super(client, {
            name: "inspire",
            description: "Get's an AI generated inspirational image & quote",
            usage: "Get's an AI generated inspirational image & quote",
            enabled: true,
            permLevel: "User"
          })
        this.data = new SlashCommandBuilder()
            .setName(this.help.name)
            .setDescription(this.help.description)  
    }

    async execute(interaction) {
        try {
            await interaction.deferReply()

            const res = await fetch(INSPIRE_URL)
            if (!res.ok) {
                await interaction.editReply({ content: INSPIRE_UNAVAILABLE })
                return
            }

            const text = (await res.text()).trim()
            if (!isHttpUrl(text)) {
                await interaction.editReply({ content: INSPIRE_UNAVAILABLE })
                return
            }

            const inspiration = new EmbedBuilder()
                .setColor(6682360)
                .setImage(text)
                .setFooter({text: `Powered by inspirobot.me`})

            await interaction.editReply({embeds: [inspiration]})
        } catch (e) {
            this.client.logger.log(e,'error')
            try {
                await interaction.editReply({ content: INSPIRE_UNAVAILABLE })
            } catch (replyError) {
                this.client.logger.log(replyError,'error')
            }
        }
    }
}

export default Inspire
