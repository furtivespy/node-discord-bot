const Command = require('../../base/Command.js')
const urban = require('../../modules/UrbanDictionary.js')

class Urban extends Command {
    constructor(client){
        super(client, {
            name: "urban",
            description: "Searches Urban Dictionary",
            category: "Info",
            usage: "Command followed by what you'd like to searh for, e.g. '!urban nakasashi' ",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: ["urbandict", "urb"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            if (args.length === 0) {
                urban.random().then(definition => {
                    if (definition) {
                        message.channel.send({embed: {
                            author: { name: definition.word, url: definition.permalink },
                            description: definition.definition,
                            color: 13749966,
                            fields: [
                                {
                                  name: "💬",
                                  value: definition.example
                                }
                            ],
                            footer: {
                                text: `👍 ${definition.thumbs_up} | 👎 ${definition.thumbs_down}`
                            }
                        }})
                    } 
                })
            } else {
                urban.top(args.join(" ")).then(definition => {
                    if (definition) {
                        message.channel.send({embed: {
                            author: { name: definition.word, url: definition.permalink },
                            description: definition.definition,
                            color: 13749966,
                            fields: [
                                {
                                  name: "💬",
                                  value: definition.example
                                }
                            ],
                            footer: {
                                text: `👍 ${definition.thumbs_up} | 👎 ${definition.thumbs_down}`
                            }
                        }})
                    } else {
                        message.reply(`Sorry, I couldn't find anything on ${args.join(" ")}`)
                    }
                })
            }
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Urban