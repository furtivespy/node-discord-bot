const Command = require('../../base/Command.js')
const fetch = require('node-fetch')
const qs = require( 'querystring' )
const wtf = require('wtf_wikipedia')
const SampleSize = require('lodash/sampleSize')


class Wiki extends Command {
    constructor(client){
        super(client, {
            name: "wiki",
            description: "Searches Wikipedia",
            category: "Fun",
            usage: "wiki <search term>",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["wikipedia", "info", "wikia", "information"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            var query = qs.stringify( {action: "opensearch", format: "json", limit: 1, search: args.join(" ")});
            fetch("https://en.wikipedia.org/w/api.php?" + query).then(res => res.json()).then(searchResults => {
                if (searchResults[1].length > 0) {
                    wtf.fetch(searchResults[1][0]).then(doc => {
                        if (doc.isDisambiguation()){
                            var somelinks = SampleSize(doc.links(), 5)
                            var links = ""
                            somelinks.forEach(item => {links += `\n${item.page}`})
                            message.channel.send(`Too many ${searchResults[0]} results. Try being more specific with "(film)" or "(album)" or something like:${links}`);
                        } else {
                            message.channel.send({embed: {
                                author: { name: doc.title(), url: searchResults[3][0] },
                                description: doc.section(0).markdown().substring(0,2040),
                                color: 13749966,
                                thumbnail: { url: doc.images(0) ? doc.images(0).json().thumb : "" },
                            }})
                        }
                    })
                } else {
                    message.channel.send("Couldn't find any info on " + searchResults[0])
                }
            })
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Wiki