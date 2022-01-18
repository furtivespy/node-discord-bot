const Command = require('../../base/Command.js')
const fetch = require('node-fetch');
const _ = require('lodash')

class Apex extends Command {
    constructor(client){
        super(client, {
            name: "apex",
            description: "Get's some Apex Legends Stats",
            category: "Games",
            usage: "use command followed by a username to get their stats",
            enabled: true,
            guildOnly: true,
            allMessages: false,
            showHelp: true,
            aliases: ["apexlegends", "apexstats"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            var msg = await message.channel.send(`Looking up some stats...`)
            
            fetch(`https://public-api.tracker.gg/apex/v1/standard/profile/5/${args.join(" ")}`, { headers: {"TRN-Api-Key": this.client.config.tracker_key}}).then(res => {
                if (!res.ok) return Promise.all([res.ok, {}])
                else return Promise.all([res.ok, res.json()])
            }).then(([ok, json]) => {
                if (!ok) return msg.edit(`Couldn't find anything`)
                var embed = {
                    author: {
                        name: `Apex Stats for ${json.data.metadata.platformUserHandle}`,
                        icon_url: "https://logodownload.org/wp-content/uploads/2019/02/apex-legends-logo-1.png"
                      },
                      thumbnail: {
                        url: json.data.children[0].metadata.icon
                      },
                      color: 12387365,
                      fields: []
                }
                embed.fields.push({
                    name: "Overall Stats",
                    value: json.data.stats.map(stat => `**${stat.metadata.name}:** ${stat.value}`).join("\n")
                })
                _.forEach(json.data.children, child => {
                    embed.fields.push({
                        name: child.metadata.legend_name,
                        inline: true,
                        value: child.stats.map(stat => `**${stat.metadata.name}:** ${stat.value}`).join("\n") || " - "
                    })
                })
                return msg.edit({embeds: [embed]} )
            })
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Apex
