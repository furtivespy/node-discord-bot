const Event = require("../base/Event.js");
const EventTypes = require("../base/EventTypes.js");

class CodeExplain extends Event {
  constructor(client) {
    super(client, {
      name: "CodeExplain",
      eventType: EventTypes.MESSAGE_REACTION_ADD,
      qualifier: "🖥️",
      description: "Explain code",
      category: "Miscellaneous",
      usage: "React to message to explain the code",
      enabled: true,
      guildOnly: true,
      showHelp: true,
      permLevel: "Moderator",
    });
  }

  async run(reaction, user, level) {
    if (reaction.emoji.name == this.help.qualifier) {

      // Extract code blocks from the message content
      const codeBlocks = reaction.message.content.match(/```[\s\S]*?```/g);

      if (codeBlocks && codeBlocks.length > 0) {
        // Process each code block
        for (const block of codeBlocks) {
          // Extract language identifier and remove backticks
          let language = block.match(/```(\w+)?/)?.[1] || '';
          let code = block.replace(/```(\w+)?\n/, '').replace(/```$/, '').trim();
                    
          const explanation = await this.client.geminiAI.explainCode(code, language);
          if (explanation) {
            await reaction.message.reply(
              {
                content: explanation
              }
            )  
          }
        } 
      } else {
        console.log("No code blocks found in the message.");
      }
    }
  }
}

module.exports = CodeExplain;
