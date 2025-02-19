const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');
const RedditImageFetcher = require("reddit-image-fetcher");

class Dicks extends SlashCommand {
    constructor(client){
        super(client, {
            name: "dicks",
            description: "Dicks",
            usage: "Use this command to get dicks",
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
        
        var subreddits = [
          'PenisPics',
          'penis',
          'AsianLadyBonerGW',
          'ladybonersgw',
          'penis'
        ]

        const redditResults = await RedditImageFetcher.fetch({
          type: 'custom',
          total: 1,
          subreddit: subreddits,
          allowNSFW: true
        })

        if (redditResults.length === 0) {
          return interaction.editReply("No results found.");
        }

        const randomResult = redditResults[Math.floor(Math.random() * redditResults.length)];
        
        await interaction.editReply({
          embeds:  [{
            "title": randomResult.title,
            "url": randomResult.postLink,
            "color": 11273754,
            "image": {
                "url": randomResult.image
            },
            "footer": {
                "icon_url": interaction.user.displayAvatarURL(),
                "text": `Requested by ${interaction.user.tag} | Powered by /r ${randomResult.subreddit}`
            }
            }]
        });
        
        
      } catch (e) {
          this.client.logger.log(e,'error')
      }
    }
}

module.exports = Dicks