import Event from '../base/Event.js';
import EventTypes from '../base/EventTypes.js';
class EmojiLogger extends Event {
    constructor(client){
        super(client, {
            name: "EmojiLogger",
            eventType: EventTypes.MESSAGE_REACTION_ADD,
            qualifier:"❌",
            description: "For Testing",
            category: "Miscellaneous",
            usage: "Testing stuff",
            enabled: false,
            guildOnly: true,
            showHelp: true,
            permLevel: "Moderator"
          })
    }
  
    async run(reaction, user, level) { // eslint-disable-line no-unused-vars
        this.client.logger.log(`${reaction._emoji} added by ${user.username}`, 'debug')
    }
}
  
export default EmojiLogger;