const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require("@google/genai");
const { AttachmentBuilder } = require("discord.js");

const createGeminiAI = (client) => {
    return new GeminiAI(client)
}

class GeminiAI {
    constructor(client) {
        this.client = client
        this.AI2 = new GoogleGenAI({apiKey: this.client.config.geminiKey})
        
    }

    async generateContent(prompt, message) {
        //const result = await this.model.generateContent(prompt)
        const result = await this.AI2.models.generateContent({
          model: "gemini-2.5-flash-preview-04-17",
          contents: prompt,
          config: {
            tools: [
              {
                googleSearch: {}
              },
            ],
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
            ],
            systemInstruction: this.getSystemInstructions(message)
           }
        })
        let botname = message.guild.members.cache.get(this.client.user.id).displayName
        return await this.processResponse(result, botname)
    }

    getSystemInstructions(message) {
      let botname = message.guild.members.cache.get(this.client.user.id).displayName
      let instructions = `You are playing the role of a slightly sarcastic, somewhat mean, but ultimately helpful AI friend. \
      A good reference for you is the character Bender from Futurama, but more helpful. \
      Actually try to be more helpful than Bender and answer questions. \
      You go by many names, such as Bender, BenderBot, GossBot, but right now you are called ${botname} or <@${this.client.user.id}>. \
      You will be given a recent transcript of a chat, you are probably there listed as "${botname} (id: <@${this.client.user.id}>" before your previous thoughts. \
      The messages are sorted oldest to newest. Don't repeat yourself too much. Keep it conversational. \
      Focus on the more recent messages (this is a chat) feel free to ignore the older messages if you think they are not relevant. \
      If you need to include an image, use the text "Processing image of" or "Generating image of" \
      to indicate where the image should be and what "prompt" should be used for it. Be very descriptive in your prompt. It will be generated with post-processing. \
      Feel free to use Grounding with Google Search to help you answer questions. \
      when referring to a user, we use either the ID or the name, not both. You should use the ID if you can. \
      Do not start your response with your name, just start with what you want to say. \
      The response needs to be broken into chunks of 2000 characters or less. use markdown when appropriate, \
      and use the text "||SEPARATE||" to indicate where one chunk ends and another begins. `
      return instructions
    }

    standardContext = "You are playing the role of a slightly sarcastic, somewhat mean, but ultimately helpful AI friend. \
    A good reference for you is the character Bender from Futurama, but more helpful. Actually try to be more helpful than Bender and answer questions. \
    You go by many names, such as Bender, BenderBot, GossBot, but right now you are called"

    async buildContext(message, nonSequitur) {
        let botname = message.guild.members.cache.get(this.client.user.id).displayName
        let context = `${this.standardContext} ${botname} or <@${this.client.user.id}>. `
        if (nonSequitur) {
            context += `Please try to include an idea from this group of random thoughts: "${nonSequitur}" `
        }
        context += `Here are the previous messages with timestamps (possibly including yours, you don't need to repeat yourself.):`
        let msgs = await message.channel.messages.fetch({limit:30}) 
        Array.from(msgs).reverse().forEach(msg => {
            if (msg[1].content[0] == message.settings.prefix) return
            let name = message.guild.members.cache.get(msg[1].author.id)?.displayName || msg[1].author.globalName
            if (name !== undefined) {
              name += " (id: <@" + msg[1].author.id + ">)"
            } else {
              name = "(id: <@" + msg[1].author.id + ">)"
            }
            context += `\n[${msg[1].createdAt.toLocaleString()}] ${name}: ${msg[1].content}`
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
        //const result = await this.model.generateContent(this.buildBasicPrompt(prompt));
        const result = await this.AI2.models.generateContent({
          model: "gemini-2.5-flash-preview-04-17",
          contents: this.buildBasicPrompt(prompt),
        })
        const {response, imageResponse} = await this.processResponse(result, "Bender")
        
        return response.split('||SEPARATE||').map(chunk => chunk.trim());
      } catch (error) {
        this.client.logger.error(error);
        return ['An error occurred while processing your request.'];
      }
    }

    async generateImage(prompt) {
      const result = await this.AI2.models.generateContent({
        model: "gemini-2.0-flash-exp-image-generation",
        contents: prompt,
        config: {
          responseModalities: ['image', 'text'],
        }
      })
      try {
        if (!result?.candidates?.[0]?.content?.parts) {
          console.error('No candidates or parts found in response');
          return null;
        }

        const parts = result.candidates[0].content.parts;
        const inlineDataPart = parts.find(part => part.inlineData);
        
        if (!inlineDataPart) {
          console.error('No inlineData found in response parts');
          return null;
        }

        // Access the nested inlineData object
        const imageData = inlineDataPart.inlineData;

        return this.createAttachmentFromInlineData(imageData);
      } catch (error) {
        console.error('Error generating image:', error);
        return null;
      }
    }

    createAttachmentFromInlineData(imageData) {
      if (!imageData?.data || !imageData?.mimeType) {
        console.error('Missing required image data or mime type');
        return null;
      }

      try {
        const buffer = Buffer.from(imageData.data, 'base64');
        const attachment = new AttachmentBuilder(buffer);
        return attachment;
      } catch (error) {
        console.error('Error creating attachment:', error);
        return null;
      }
    }

    async processResponse(result, botname) {      
      let response = result.text.trim()

      //check if there is an image needed, if so prompt the imagegen for the image
      let image = null
      if (response.includes("Processing image of") || response.includes("Generating image of")) {
        const keyword = response.includes("Processing image of") ? "Processing image of" : "Generating image of"
        const parts = response.split(keyword)
        const imagePart = parts[1].split("\n")[0]
        image = imagePart.trim()
      }

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
      result.candidates.forEach(candidate => {
        if (candidate.groundingMetadata?.groundingChunks) {
          response += "||SEPARATE||Sources: "
          candidate.groundingMetadata.groundingChunks.forEach(chunk => {
            response += `[${chunk.web.title}](<${chunk.web.uri}>) `
          })
        }
      })

      //check if there is an image needed, if so prompt the imagegen for the image
      let imageResponse = null
      if (image) {
        imageResponse = await this.generateImage(`generate an image of ${image}`)
      }

      return {response, imageResponse}
    }
}

module.exports = { createGeminiAI }