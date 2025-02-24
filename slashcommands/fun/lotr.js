const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder, EmbedBuilder } = require("@discordjs/builders");
const fetch = require("node-fetch");

const BASE_URL = "https://the-one-api.dev/v2";

class Lotr extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "lotr",
      description: "Get a random LOTR quote",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description);
  }

  async execute(interaction) {
    await interaction.deferReply();

    //get total quotes
    const totalQuoteParams = new URLSearchParams();
    totalQuoteParams.set("limit", "0");
    const totalQuoteUrl = `${BASE_URL}/quote?${totalQuoteParams.toString()}`;
    const res = await fetch(totalQuoteUrl, {
      headers: {
        Authorization: `Bearer ${this.client.config.LOTR_API_KEY}`,
      },
    });
    const data = await res.json();

    const totalQuotes = data.total;

    //get random quote
    const randomQuote = Math.floor(Math.random() * totalQuotes);
    const quoteParams = new URLSearchParams();
    quoteParams.set("limit", "1");
    quoteParams.set("offset", randomQuote.toString());

    const quoteUrl = `${BASE_URL}/quote?${quoteParams.toString()}`;
    const quoteRes = await fetch(quoteUrl, {
      headers: {
        Authorization: `Bearer ${this.client.config.LOTR_API_KEY}`,
      },
    });
    const quoteData = await quoteRes.json();

    //get movie name
    const movieUrl = `${BASE_URL}/movie/${quoteData.docs[0].movie}`;
    const movieRes = await fetch(movieUrl, {
      headers: {
        Authorization: `Bearer ${this.client.config.LOTR_API_KEY}`,
      },
    });
    const movieData = await movieRes.json();

    //get character name
    const characterUrl = `${BASE_URL}/character/${quoteData.docs[0].character}`;
    const characterRes = await fetch(characterUrl, {
      headers: {
        Authorization: `Bearer ${this.client.config.LOTR_API_KEY}`,
      },
    });
    const characterData = await characterRes.json();

    // Get character image
    let characterImage;
    try {
      characterImage = await super.getRandomGoogleImg(
        `Lord of the Rings ${characterData.docs[0].name}`,
        false,
        true
      );
    } catch (e) {
      this.client.logger.log(e, "error");
    }

    const embed = new EmbedBuilder()
      .setDescription(`# ${quoteData.docs[0].dialog}`)
      .setFooter({
        text: `${characterData.docs[0].name} | ${movieData.docs[0].name}`,
      })
      .setColor(Math.floor(Math.random() * 16777215));

    // Add the image if one was found
    if (characterImage) {
      embed.setThumbnail(characterImage.link);
    }

    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = Lotr;
