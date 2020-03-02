const Event = require('../base/Event.js')
const EventTypes = require('../base/EventTypes.js')

class BotQuiet extends Event {
    constructor(client){
        super(client, {
            name: "BotQuiet",
            eventType: EventTypes.MESSAGE_REACTION_ADD,
            qualifier:"❌",
            description: "Sometimes the bot says too much.",
            category: "Miscellaneous",
            usage: "React to bot message with ❌ to have bot delete its message",
            enabled: true,
            guildOnly: true,
            showHelp: true,
            permLevel: "Moderator"
          })
    }
  
    async run(reaction, user, level) { // eslint-disable-line no-unused-vars
        if (reaction.message.author.id == this.client.user.id && reaction.emoji.name == '❌' ){
              reaction.message.delete().catch(O_o=>{});     
        }
    }
}
  
module.exports = BotQuiet;