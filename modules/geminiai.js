const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const createGeminiAI = (client) => {
    return new GeminiAI(client)
}

class GeminiAI {
    constructor(client) {
        this.client = client
        this.genAI = new GoogleGenerativeAI(this.client.config.geminiKey)
        this.model = this.genAI.getGenerativeModel(
          { model: "gemini-2.0-flash",
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
            ],
            tools: [
              {
                google_search: {}
              },
            ],
           }
        )
    }

    async generateContent(prompt, message) {
        const result = await this.model.generateContent(prompt)
        let botname = message.guild.members.cache.get(this.client.user.id).displayName
        return this.processResponse(result, botname)
    }

    standardContext = "You are playing the role of a slightly sarcastic, somewhat mean, but ultimately helpful AI friend. \
    A good reference for you is the character Bender from Futurama, but more helpful. Actually try to be more helpful than Bender and answer questions. \
    You go by many names, such as Bender, BenderBot, GossBot, but right now you are called"

    async buildContext(message, nonSequitur) {
        let botname = message.guild.members.cache.get(this.client.user.id).displayName
        let context = `${this.standardContext} ${botname} or <@${this.client.user.id}>. `
        if (nonSequitur) {
            context += `please also try to include an idea from this group of random thoughts: "${nonSequitur}" `
        }
        context += `Your response is next, The response needs to be broken into chunks of 2000 characters or less. use markdown when appropriate, \
      and use the text "||SEPARATE||" to indicate where one chunk ends and another begins. Feel free to use Grounding with Google Search to help you answer questions. \
        when referring to a user, we use either the ID or the name, not both. You should use the ID if you can. \
        Do not start your response with your name, just start with what you want to say. \
        The following is the recent transcript of the chat, you are probably there listed as "${botname} (id: <@${this.client.user.id}>" before your previous thoughts. \
        The messages are sorted oldest to newest. Don't repeat yourself too much. Keep it conversational. \
        Focus on the more recent messages (this is a chat) feel free to ignore the older messages if you think they are not relevant. \
        Here are the previous messages (possibly including yours, you don't need to repeat yourself.):`
        let msgs = await message.channel.messages.fetch({limit:25}) 
        Array.from(msgs).reverse().forEach(msg => {
            if (msg[1].content[0] == message.settings.prefix) return
            let name = message.guild.members.cache.get(msg[1].author.id)?.displayName || msg[1].author.globalName
            if (name !== undefined) {
              name += " (id: <@" + msg[1].author.id + ">)"
            } else {
              name = "(id: <@" + msg[1].author.id + ">)"
            }
            context += `\n${name}: ${msg[1].content}`
        })
        //this.client.logger.log(context)
        return context
    }

    async explainCode(code, language) {
        const prompt = ` In chunks of 2000 characters or less, Please explain the following ${language} code: \
        \`\`\`${language} \
        ${code} \
        \`\`\`  \
        Provide a clear and concise explanation of what this code does, its purpose, and any notable features or potential issues. \
        \n\nThe response needs to be broken into chunks of 2000 characters or less. use markdown when appropriate, \
      and use the text "||SEPARATE||" to indicate where one chunk ends and another begins.`

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();
            return response.split('||SEPARATE||').map(chunk => chunk.trim());
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
        const response = this.processResponse(result)
        
        return response.split('||SEPARATE||').map(chunk => chunk.trim());
      } catch (error) {
        this.client.logger.error(error);
        return ['An error occurred while processing your request.'];
      }
    }

    processResponse(result, botname) {
      let response = result.response.text().trim()
      if (response.endsWith('||SEPARATE||')) {
          response = response.slice(0, -12); // Remove trailing ||SEPARATE||
      }
      if (response.startsWith(`<@${this.client.user.id}>`)) {
        response = response.replace(`<@${this.client.user.id}>: `, "")
      }
      if (botname && response.startsWith(`${botname}: `)) {
        response = response.replace(`${botname}: `, "")
      }
      if (response.startsWith(`"`)) {
        response = response.slice(1, -1)
      }
      result.response.candidates.forEach(candidate => {
        console.log("groundingMetadata", candidate.groundingMetadata)
        if (candidate.groundingMetadata?.groundingChunks) {
          response += "||SEPARATE||Sources: "
          candidate.groundingMetadata.groundingChunks.forEach(chunk => {
            response += `[${chunk.web.title}](<${chunk.web.uri}>) `
          })
        }
      })

      //console.log("response", response)
      //console.log("result", result.response)

      return response
    }
}

module.exports = { createGeminiAI }