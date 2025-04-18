const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const fetch = require("node-fetch");
const { XMLParser } = require("fast-xml-parser");
const { find, cloneDeep, take } = require("lodash");
const { createCanvas, Image, loadImage } = require("canvas");
const he = require("he");
const TurndownService = require("turndown");

class BoardGameGeek {
  constructor(gameId, discordClient, interaction) {
    this.gameId = gameId;
    this.discordClient = discordClient;
    this.interaction = interaction;
    this.embeds = [];
    this.attachments = [];
    this.otherAttachments = [];
  }

  static async CreateAndLoad(gameId, discordClient, interaction) {
    let bgg = new BoardGameGeek(gameId, discordClient, interaction);
    await bgg.LoadBggData();
    return bgg;
  }

  static DetailsEnum = {
    ALL: 'all',
    BASIC: 'basic',
    AWARDS: 'awards',
    ALLEPHEMERAL: 'allephemeral',
  }

  static isEphemeral(detailsType) {
    if (detailsType == BoardGameGeek.DetailsEnum.ALLEPHEMERAL ||
        detailsType == BoardGameGeek.DetailsEnum.LINKSEPHMERAL) 
    {
      return true
    }
    return false
  }

  async LoadBggData() {
    let gameInfoResp = await fetch(
      `https://api.geekdo.com/xmlapi/boardgame/${this.gameId}?stats=1`
    );
    const text = await gameInfoResp.text();
    const parser = new XMLParser({
      attributeNamePrefix: "",
      textNodeName: "text",
      ignoreAttributes: false,
      ignoreNameSpace: true,
      allowBooleanAttributes: true,
    });
    this.gameInfo = parser.parse(text).boardgames.boardgame;

    const gameName = Array.isArray(this.gameInfo.name)
      ? find(this.gameInfo.name, { primary: "true" }).text
      : this.gameInfo.name.text;

    this.gameName = he.decode(gameName);
  }

  async LoadEmbeds(detailsType) {
    switch (detailsType) {
      case BoardGameGeek.DetailsEnum.BASIC:
        await this.GetGameImageEmbed()
        this.GetGameDescriptionEmbed()
        break;
      case BoardGameGeek.DetailsEnum.AWARDS:
        await this.GetGameImageEmbed()
        this.GetGameAwardsEmbed()
        break;
      case BoardGameGeek.DetailsEnum.ALLEPHEMERAL:
      case BoardGameGeek.DetailsEnum.ALL:
      default:
        await this.GetGameImageEmbed()
        this.GetGameDetailsEmbed()
        this.GetGameDescriptionEmbed()
        this.GetGameAwardsEmbed()
        break;
    }
  }

  async GetGameImageEmbed() {
    if (!this.gameInfo.image) {
      // If no image is available, create a basic embed without an image
      const imageEmbed = new EmbedBuilder()
          .setTitle(this.gameName)
          .setURL(`https://boardgamegeek.com/boardgame/${this.gameId}`);
      this.embeds.push(imageEmbed);
      return;
    }
    const gameImage = await loadImage(this.gameInfo.image);
    const scaledWidth = 600;
    const canvas = createCanvas(scaledWidth, (scaledWidth / gameImage.width) * gameImage.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(gameImage, 0, 0, scaledWidth, (scaledWidth / gameImage.width) * gameImage.height);
    const imageAttach = new AttachmentBuilder(
      canvas.toBuffer(),
      {name: `gameImage.png`}
    );
    this.attachments.push(imageAttach);

    const imageEmbed = new EmbedBuilder()
      .setTitle(this.gameName)
      .setURL(`https://boardgamegeek.com/boardgame/${this.gameId}`)
      .setImage(`attachment://gameImage.png`);
    this.embeds.push(imageEmbed);

    // Explicitly free resources
    canvas.width = 1;
    canvas.height = 1;
    ctx.clearRect(0, 0, 1, 1);
  }

  GetGameDetailsEmbed() {
    //Embed 2 - Stats and Details
    let ranks = ""
    if (Array.isArray(this.gameInfo.statistics.ratings.ranks.rank)) {
      this.gameInfo.statistics.ratings.ranks.rank.forEach(r => {ranks += `\n**${he.decode(r.friendlyname)}:** ${r.value}`})
    } else {
      ranks += `\n**${he.decode(this.gameInfo.statistics.ratings.ranks.rank.friendlyname)}:** ${this.gameInfo.statistics.ratings.ranks.rank.value}`
    }
    let suggestedPlayers = ""
    const suggestedPlayerPoll = find(this.gameInfo.poll, {name: "suggested_numplayers"})
    suggestedPlayerPoll.results.forEach(r => {
      r.result.sort((a, b) => b.numvotes - a.numvotes)
      suggestedPlayers += `\n**${r.numplayers}**: ${r.result[0].value}`
    })
    
    const detailEmbed = new EmbedBuilder().setTitle(`Details`).addFields(
      {
        name: "Game Data",
        value: `**Published:** ${this.gameInfo.yearpublished}\n**Players:** ${this.gameInfo.minplayers} - ${this.gameInfo.maxplayers}\n**Playing Time:** ${this.gameInfo.minplaytime} - ${this.gameInfo.maxplaytime}\n**Age:** ${this.gameInfo.age}+`,
        inline: true,
      },
      {
        name: `Ranks & Ratings`,
        value: `**Average Rating:** ${this.gameInfo.statistics.ratings.average}\n**Weight:** ${this.gameInfo.statistics.ratings.averageweight}${ranks}`,
        inline: true,
      },
      {
        name: `Suggested Player Count`,
        value: `${suggestedPlayers}`,
        inline: true,
      },
      {
        name: `Designer(s)`,
        value: this.gameInfo.boardgamedesigner ? Array.isArray(this.gameInfo.boardgamedesigner) ? this.gameInfo.boardgamedesigner.map(d => d.text).join("\n") : this.gameInfo.boardgamedesigner.text : "N/A",
        inline: true
      },
      {
        name: `Publisher(s)`,
        value: Array.isArray(this.gameInfo.boardgamepublisher) ? this.gameInfo.boardgamepublisher.map(d => d.text).join("\n") : this.gameInfo.boardgamepublisher.text,
        inline: true
      }
    );
    if (this.gameInfo.boardgamemechanic) {
      detailEmbed.addFields(
        {
          name: `Mechanics`,
          value: Array.isArray(this.gameInfo.boardgamemechanic) ? this.gameInfo.boardgamemechanic.map(d => d.text).join("\n") : this.gameInfo.boardgamemechanic.text,
          inline: true
        }
      );
    }
    if (this.gameInfo.boardgameexpansion) {
      detailEmbed.addFields(
        {
          name: `Expansions`,
          value: Array.isArray(this.gameInfo.boardgameexpansion) ? take(this.gameInfo.boardgameexpansion,10).map(d => `[${d.text}](https://boardgamegeek.com/boardgame/${d.objectid})`).join("\n") : `[${this.gameInfo.boardgameexpansion.text}](https://boardgamegeek.com/boardgame/${this.gameInfo.boardgameexpansion.objectid})`,
          inline: true
        }
      )
    }
    this.embeds.push(detailEmbed);
  }

  GetGameDescriptionEmbed() {
    //Embed 3 - Description
    const turndownService = new TurndownService();
    const descriptionEmbed = new EmbedBuilder()
      .setTitle("Description")
      .setDescription(
        turndownService.turndown(he.decode(this.gameInfo.description))
      );
    this.embeds.push(descriptionEmbed);
  }

  GetGameAwardsEmbed() {
    //Embed 4 - awards and honors
    if (this.gameInfo.boardgamehonor && Array.isArray(this.gameInfo.boardgamehonor)) {
      let honors = "";
      this.gameInfo.boardgamehonor.forEach((honor) => {
        honors += `${he.decode(honor.text)}\n`;
      });
      const awardEmbed = new EmbedBuilder()
        .setTitle(`Awards and Honors`)
        .setDescription(honors);
      this.embeds.push(awardEmbed);
    }
  }
}

module.exports = BoardGameGeek;