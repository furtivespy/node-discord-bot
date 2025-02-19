const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');
const fetch = require('node-fetch');

class Boobs extends SlashCommand {
    constructor(client){
        super(client, {
            name: "boobs",
            description: "Boobs",
            usage: "Use this command to get boobs",
            enabled: true,
            permLevel: "User"
          })
		  this.data = new SlashCommandBuilder()
        .setName(this.help.name)
        .setDescription(this.help.description)
        .setNSFW(true)
    }

    async execute(interaction) {
      try {
        interaction.deferReply()
        
        fetch("http://api.oboobs.ru/boobs/0/1/random").then(res => res.json()).then( async body => {
          await interaction.editReply({
              embeds: [{
              "title": "Click here if the image failed to load.",
              "url": `http://media.oboobs.ru/${body[0].preview}`,
              "color": 15285942,
              "image": {
                  "url": `http://media.oboobs.ru/${body[0].preview}`
              },
              "footer": {
                  "icon_url": interaction.user.displayAvatarURL(),
                  "text": `Requested by ${interaction.user.tag} | Powered by oboobs.ru`
              }
              }]
          });
        });
      } catch (e) {
          this.client.logger.log(e,'error')
      }
    }
}

module.exports = Boobs