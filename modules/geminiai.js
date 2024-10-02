const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const createGeminiAI = (client) => {
    return new GeminiAI(client)
}

class GeminiAI {
    constructor(client) {
        this.client = client
        this.genAI = new GoogleGenerativeAI(this.client.config.geminiKey)
        this.model = this.genAI.getGenerativeModel(
          { model: "gemini-1.5-flash",
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
            ]
           }
        )
    }

    async generateContent(prompt, message) {
        const result = await this.model.generateContent(prompt)
        let botname = message.guild.members.cache.get(this.client.user.id).displayName
        let text = result.response.text()
        if (text.startsWith(`<@${this.client.user.id}>`)) {
            text = text.replace(`<@${this.client.user.id}>: `, "")
        }
        if (text.startsWith(`${botname}: `)) {
          text = text.replace(`${botname}: `, "")
        }
        text = text.trim()
        if (text.startsWith(`"`)) {
            text = text.slice(1, -1)
        }
        return text
    }

    standardContext = "You are playing the role of a slightly sarcastic, somewhat mean, but ultimately helpful AI friend. \
    A good reference for you is the character Bender from Futurama, but more helpful. Actually try to be more helpful than Bender and answer questions. \
    You go by many names, such as Bender, BenderBot, GossBot, but right now you are called"

    async buildContext(message, nonSequitur) {
        let botname = message.guild.members.cache.get(this.client.user.id).displayName
        let context = `${this.standardContext} ${botname} or <@${this.client.user.id}>. `
        if (nonSequitur) {
            context += `please also include an idea from this group of random thoughts: "${nonSequitur}" `
        }
        context += `Your response is next, please keep it under 2000 characters. \
        when referring to a user, we use either the ID or the name, not both. \
        Do not start your response with your name, just start with what you want to say. \
        Here are the previous messages (possibly including yours, you don't need to repeat yourself.):`
        let msgs = await message.channel.messages.fetch({limit:25}) 
        Array.from(msgs).reverse().forEach(msg => {
            if (msg[1].content[0] == message.settings.prefix) return
            let name = message.guild.members.cache.get(msg[1].author.id)?.displayName || msg[1].author.globalName
            if (name !== undefined) {
                name += " (id: <@" + msg[1].author.id + ">)"
                context += `\n${name}: ${msg[1].content}`
            }
        })
        return context
    }

    async explainCode(code, language) {
        const prompt = `Please explain the following ${language} code: \
        \`\`\`${language} \
        ${code} \
        \`\`\`  \
        Provide a clear and concise explanation of what this code does, its purpose, and any notable features or potential issues. \
        keep your response under 2000 characters.`;

        try {
            const result = await this.model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            this.client.logger.error(error);
            return '';
        }
    }

    buildBasicPrompt(prompt) {
      let fullPrompt = prompt
      fullPrompt += `\n\nThe response needs to be broken into chunks of 2000 characters or less. use markdown when appropriate, \
      and use the text "||SEPARATE||" to indicate where one chunk ends and another begins.`
      return fullPrompt
    }

    async runPrompt(prompt){
      try {
        const result = await this.model.generateContent(this.buildBasicPrompt(prompt));
        const response = result.response.text();
        return response.split('||SEPARATE||').map(chunk => chunk.trim());
      } catch (error) {
        this.client.logger.error(error);
        return ['An error occurred while processing your request.'];
      }
    }
}

module.exports = { createGeminiAI }