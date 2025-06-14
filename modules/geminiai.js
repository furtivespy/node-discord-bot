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
      const botname = message.guild.members.cache.get(this.client.user.id).displayName;
      const clientId = this.client.user.id;

      // New block for loading personality based on ai_selected_personality setting
      const selectedPersonalityKey = message.settings.ai_selected_personality || "bender";
      let personality;

      switch (selectedPersonalityKey) {
        case "detective":
          personality = require('./prompt_components/personality_detective.js');
          break;
        case "zenmaster_nj":
          personality = require('./prompt_components/personality_zenmaster_nj.js');
          break;
        case "dwarf_craftsman":
          personality = require('./prompt_components/personality_dwarf_craftsman.js');
          break;
        case "ship_computer":
          const shipComputerFn = require('./prompt_components/personality_ship_computer.js');
          personality = shipComputerFn(message.guild ? message.guild.name : "Default Guild"); // Added a fallback for guild name
          break;
        case "educator_joy":
          personality = require('./prompt_components/personality_educator_joy.js');
          break;
        case "oracle_sigh":
          personality = require('./prompt_components/personality_oracle_sigh.js');
          break;
        case "shakespeare": // New case
          personality = require('./prompt_components/personality_shakespeare.js');
          break;
        case "pirate_qm": // New case
          const pirateQmFn = require('./prompt_components/personality_pirate_qm.js');
          personality = pirateQmFn(message.guild ? message.guild.name : "Default Guild");
          break;
        case "anxious_philosopher": // New case
          personality = require('./prompt_components/personality_anxious_philosopher.js');
          break;
        case "chicago_pope": // New case
          personality = require('./prompt_components/personality_chicago_pope.js');
          break;
        case "bender":
        default: // Fallback to bender if key is invalid or explicitly bender
          personality = require('./prompt_components/personality_bender.js');
          break;
      }
      // End of new block
      const identity = require('./prompt_components/identity.js')(botname, clientId);
      const chatInstructions = require('./prompt_components/chat_instructions.js');
      const formattingInstructions = require('./prompt_components/formatting_instructions.js');
      const capabilities = require('./prompt_components/capabilities.js');

      // Construct the full instruction string, joining components with a space.
      const instructions = [
        personality,
        identity,
        chatInstructions,
        capabilities,
        formattingInstructions
      ].join(' ');

      return instructions;
    }

    async buildContext(message, nonSequitur) {
    let context = "";
    if (nonSequitur) {
        // Ensure there's a space after the nonSequitur if other text follows,
        // but here it's followed by a descriptive sentence.
        context += `Please try to include an idea from this group of random thoughts: "${nonSequitur}" `;
    }

    // If nonSequitur was added, ensure the next part of the context starts appropriately.
    // Adding a newline or space if needed. Here, the next part is a sentence, so a space or newline is good.
    if (context.length > 0) {
        context += "\n"; // Add a newline if nonSequitur was present for better separation
    }

    context += `Here are the previous messages with timestamps (possibly including yours, you don't need to repeat yourself.):`;
    let msgs = await message.channel.messages.fetch({limit:30});
    Array.from(msgs).reverse().forEach(msg => {
        if (msg[1].content[0] == message.settings.prefix) return;
        let name = message.guild.members.cache.get(msg[1].author.id)?.displayName || msg[1].author.globalName;
        if (name !== undefined) {
          name += " (id: <@" + msg[1].author.id + ">)";
        } else {
          name = "(id: <@" + msg[1].author.id + ">)";
        }
        context += `\n[${msg[1].createdAt.toLocaleString()}] ${name}: ${msg[1].content}`;
    });
    return context;
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