const { GoogleGenAI, HarmCategory, HarmBlockThreshold, Type } = require("@google/genai");
const { AttachmentBuilder } = require("discord.js");
const { liveMessageText } = require("./chatArchive.js");
const { createContextPackService, scrubErrorMessage } = require("./contextPacks.js");

const GROUNDING_FILE_SEARCH = "file_search";
const GROUNDING_GOOGLE_SEARCH = "google_search";
const GROUNDING_NONE = "none";
const GOOGLE_SEARCH_TOOLS = [{ googleSearch: {} }];
const GROUNDING_CHOICES = new Set([
  GROUNDING_FILE_SEARCH,
  GROUNDING_GOOGLE_SEARCH,
  GROUNDING_NONE,
]);
const NON_SEQUITUR_PREFIX = "Please try to include an idea from this group of random thoughts:";

function describeError(error) {
  const parts = [error?.message || String(error)];
  const cause = error?.cause;
  if (cause) {
    const detail = [cause.code, cause.syscall, cause.hostname, cause.message].filter(Boolean).join(" ");
    if (detail) parts.push(`cause: ${detail}`);
  }
  return parts.join(" | ");
}

function isNetworkFetchError(error) {
  const message = `${error?.message || ""} ${error?.cause?.message || ""}`;
  return /fetch failed|HeadersTimeoutError|UND_ERR|ECONNRESET|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|certificate/i.test(message);
}

const createGeminiAI = (client) => {
    return new GeminiAI(client)
}

class GeminiAI {
    constructor(client) {
        this.client = client
        this.AI2 = new GoogleGenAI({apiKey: this.client.config.geminiKey})
        this.contextPacks = createContextPackService({ logger: this.client.logger })
    }

    chatSafetySettings() {
      return [
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
      ];
    }

    fileSearchReady(message) {
      if (!message.guild) return false;
      try {
        return this.client.getDatabase(message.guild.id).hasFileSearchReady();
      } catch (error) {
        this.client.logger.log(error, "warn");
        return false;
      }
    }

    chatTools(message, grounding = GROUNDING_GOOGLE_SEARCH) {
      if (grounding === GROUNDING_NONE) return [];
      if (grounding === GROUNDING_FILE_SEARCH && message.guild) {
        try {
          const store = this.client.getDatabase(message.guild.id).getFileSearchStore();
          if (store) return [{ fileSearch: { fileSearchStoreNames: [store] } }];
        } catch (error) {
          this.client.logger.log(error, "warn");
        }
      }
      return GOOGLE_SEARCH_TOOLS;
    }

    async generateContent(contents, message) {
        // Grounding stays XOR (google_search OR file_search OR none). Guild CSV
        // packs are ordinary prompt text, attached after the router chooses.
        const grounding = this.fileSearchReady(message)
          ? await this.chooseGrounding(this.routerContents(contents))
          : GROUNDING_GOOGLE_SEARCH;
        const tools = this.chatTools(message, grounding);
        const packed = await this.attachGuildContextPacks(contents, message);
        try {
          return await this.generateContentWithTools(packed.contents, message, tools, packed.note);
        } catch (error) {
          const hasFileSearch = tools.some((tool) => tool.fileSearch);
          if (hasFileSearch && !isNetworkFetchError(error)) {
            this.client.logger.log(
              `Gemini File Search request failed (${describeError(error)}); retrying without File Search`,
              "warn"
            );
            return await this.generateContentWithTools(packed.contents, message, GOOGLE_SEARCH_TOOLS, packed.note);
          }
          throw new Error(`Gemini request failed: ${describeError(error)}`, { cause: error });
        }
    }

    async attachGuildContextPacks(contents, message) {
      try {
        return await this.contextPacks.attachIfNeeded(contents, message);
      } catch (error) {
        this.client.logger.log(`context pack attach failed (${scrubErrorMessage(error)})`, "warn");
        return { contents, attached: [], note: "" };
      }
    }

    routerContents(contents) {
      return contents.map((turn) => {
        const text = turn?.parts?.[0]?.text;
        if (turn.role !== "user" || !text || !text.includes(NON_SEQUITUR_PREFIX)) return turn;
        const stripped = text.split(`\n\n${NON_SEQUITUR_PREFIX}`)[0];
        return { ...turn, parts: [{ ...turn.parts[0], text: stripped }] };
      });
    }

    async chooseGrounding(contents) {
      try {
        const result = await this.AI2.models.generateContent({
          model: "gemini-flash-latest",
          contents,
          config: {
            temperature: 0,
            maxOutputTokens: 128,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                grounding: {
                  type: Type.STRING,
                  enum: [GROUNDING_FILE_SEARCH, GROUNDING_GOOGLE_SEARCH, GROUNDING_NONE],
                  description: "Which grounding to use for the reply.",
                },
              },
              required: ["grounding"],
            },
            safetySettings: this.chatSafetySettings(),
            systemInstruction: require("./prompt_components/grounding_router.js"),
          },
        });
        const raw = this.routerResponsePreview(result);
        const choice = this.parseGroundingChoice(raw.text);
        if (choice) {
          this.client.logger.log(`grounding router chose ${choice}`, "log");
          return choice;
        }
        this.client.logger.log(
          `grounding router returned an invalid choice; defaulting to google_search. response: ${raw.preview}`,
          "warn"
        );
      } catch (error) {
        this.client.logger.log(
          `grounding router failed (${describeError(error)}); defaulting to google_search`,
          "warn"
        );
      }
      return GROUNDING_GOOGLE_SEARCH;
    }

    routerResponseText(result) {
      if (typeof result?.text === "string" && result.text.trim()) return result.text.trim();
      const parts = result?.candidates?.[0]?.content?.parts || [];
      return parts.map((part) => part.text).filter(Boolean).join("").trim();
    }

    routerResponsePreview(result) {
      const text = this.routerResponseText(result);
      const candidate = result?.candidates?.[0];
      const preview = text
        ? text.slice(0, 500)
        : JSON.stringify({
            finishReason: candidate?.finishReason,
            blockReason: result?.promptFeedback?.blockReason,
            partKeys: candidate?.content?.parts?.map((part) => Object.keys(part)),
          });
      return { text, preview };
    }

    parseGroundingChoice(text) {
      if (!text) return null;
      const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || text;
      try {
        const parsed = JSON.parse(jsonText);
        const value = String(parsed?.grounding || "").trim();
        return GROUNDING_CHOICES.has(value) ? value : null;
      } catch {
        return null;
      }
    }

    async generateContentWithTools(contents, message, tools, extraInstruction = "") {
        const config = {
          safetySettings: this.chatSafetySettings(),
          systemInstruction: this.getSystemInstructions(message, tools, extraInstruction),
        };
        if (tools.length > 0) config.tools = tools;
        const result = await this.AI2.models.generateContent({
          model: "gemini-flash-latest",
          contents,
          config,
        })
        let botname = message.guild.members.cache.get(this.client.user.id).displayName
        return await this.processResponse(result, botname)
    }

    getSystemInstructions(message, tools = [], extraInstruction = "") {
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
      const identity = require('./prompt_components/identity.js')(botname, clientId, this.buildPeopleRoster(message));
      const chatInstructions = require('./prompt_components/chat_instructions.js')(tools);
      const formattingInstructions = require('./prompt_components/formatting_instructions.js');
      const capabilities = require('./prompt_components/capabilities.js')(tools);

      // Construct the full instruction string, joining components with a space.
      const instructions = [
        personality,
        identity,
        chatInstructions,
        capabilities,
        formattingInstructions,
        extraInstruction,
      ].filter(Boolean).join(' ');

      return instructions;
    }

    buildPeopleRoster(message) {
      if (!message.guild) return "";
      const people = this.client.getDatabase(message.guild.id).listPeople();
      if (people.length === 0) return "";
      return people.map((person) => `- <@${person.user_id}> is ${person.real_name}`).join("\n");
    }

    getPeopleMap(message) {
      if (!message.guild) return new Map();
      return this.client.getDatabase(message.guild.id).getPeopleMap();
    }

    async buildContext(message, nonSequitur) {
      const history = await message.channel.messages.fetch({ limit: 40 });
      const chronological = Array.from(history.values()).reverse();
      const botId = this.client.user.id;
      const peopleById = this.getPeopleMap(message);
      const turns = [];

      for (const discordMessage of chronological) {
        if (discordMessage.content && discordMessage.content[0] == message.settings.prefix) continue;
        const text = liveMessageText(discordMessage);
        if (!text) continue;

        const role = discordMessage.author.id === botId ? "model" : "user";
        const line = this.formatHistoryLine(message, discordMessage, role, peopleById, text);
        const last = turns[turns.length - 1];

        if (last && last.role === role) {
          last.parts[0].text += `\n${line}`;
        } else {
          turns.push({ role, parts: [{ text: line }] });
        }
      }

      if (turns.length === 0) {
        turns.push({
          role: "user",
          parts: [{ text: this.formatHistoryLine(message, message, "user", peopleById) }],
        });
      }

      this.attachNonSequitur(turns, nonSequitur);
      this.ensureValidTurnSequence(turns);
      return turns;
    }

    formatHistoryLine(message, discordMessage, role, peopleById = new Map(), text = liveMessageText(discordMessage)) {
      if (role === "model") {
        return text;
      }
      const member = message.guild.members.cache.get(discordMessage.author.id);
      const name = member?.displayName || discordMessage.author.globalName || discordMessage.author.username;
      const realName = peopleById.get(discordMessage.author.id);
      const speaker = realName
        ? `${name} (${realName}, id: <@${discordMessage.author.id}>)`
        : name
          ? `${name} (id: <@${discordMessage.author.id}>)`
          : `(id: <@${discordMessage.author.id}>)`;
      return `[${discordMessage.createdAt.toLocaleString()}] ${speaker}: ${text}`;
    }

    attachNonSequitur(turns, nonSequitur) {
      if (!nonSequitur) return;
      const spice = `${NON_SEQUITUR_PREFIX} "${nonSequitur}"`;
      for (let i = turns.length - 1; i >= 0; i--) {
        if (turns[i].role === "user") {
          turns[i].parts[0].text += `\n\n${spice}`;
          return;
        }
      }
      turns.push({ role: "user", parts: [{ text: spice }] });
    }

    ensureValidTurnSequence(turns) {
      if (turns.length === 0) return;
      if (turns[0].role === "model") {
        turns.unshift({
          role: "user",
          parts: [{ text: "(conversation already in progress)" }],
        });
      }
      if (turns[turns.length - 1].role === "model") {
        turns.push({
          role: "user",
          parts: [{ text: "Please continue the conversation." }],
        });
      }
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
            const result = await this.AI2.models.generateContent({
                model: "gemini-flash-latest",
                contents: prompt,
            });
            const {response} = await this.processResponse(result, "Bender");
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
          model: "gemini-flash-latest",
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
      return this.generateImageNew(prompt);
    }

    /**
     * Generate an image with Gemini Flash Image (Imagen 4 endpoints were shut down).
     */
    async generateImageNew(prompt, options = {}) {
      try {
        const aspectRatio = options.aspectRatio || "1:1";
        console.log("Generating image with prompt: ", prompt);

        const result = await this.AI2.models.generateContent({
          model: "gemini-3.1-flash-image",
          contents: prompt,
          config: {
            responseModalities: ["IMAGE"],
            responseFormat: {
              image: {
                aspectRatio,
              },
            },
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
          },
        });

        const parts = result?.candidates?.[0]?.content?.parts;
        if (!parts) {
          console.error("No candidates or parts found in image response");
          return null;
        }

        const inlineDataPart = parts.find((part) => part.inlineData);
        if (!inlineDataPart) {
          console.error("No inlineData found in image response parts");
          return null;
        }

        return this.createAttachmentFromInlineData(inlineDataPart.inlineData);
      } catch (error) {
        console.error("Error generating image:", error);
        return null;
      }
    }

     /**
      * Edit an existing image based on a prompt
      * @param {string} prompt - Description of how to edit the image
      * @param {string|Buffer} imageData - Base64 string or Buffer of the image to edit
      * @param {string} mimeType - MIME type of the input image (e.g., 'image/jpeg')
      * @param {Object} options - Additional options
      */
     async editImage(prompt, imageData, mimeType = 'image/jpeg', options = {}) {
       try {
         // Convert Buffer to base64 if needed
         let imageBytes;
         if (Buffer.isBuffer(imageData)) {
           imageBytes = imageData.toString('base64');
         } else {
           imageBytes = imageData;
         }

         const image = {
           imageBytes: imageBytes,
           mimeType: mimeType
         };

         const config = {
           numberOfImages: options.numberOfImages || 1,
           aspectRatio: options.aspectRatio || "1:1",
           outputMimeType: options.outputMimeType || "image/jpeg",
           includeRaiReason: true,
           editMode: options.editMode || undefined, // Can be specific edit modes
           ...options.config
         };

         const result = await this.AI2.models.editImage({
           model: "imagen-3.0-capability-001",
           prompt: prompt,
           image: image,
           config: config
         });

         if (!result?.generatedImages || result.generatedImages.length === 0) {
           console.error('No edited images found in response');
           return null;
         }

         const generatedImage = result.generatedImages[0];
         
         if (generatedImage.raiFilteredReason) {
           console.warn('Edited image was filtered:', generatedImage.raiFilteredReason);
           return null;
         }

         if (!generatedImage.image?.imageBytes) {
           console.error('No image bytes found in edited image');
           return null;
         }

         const buffer = Buffer.from(generatedImage.image.imageBytes, 'base64');
         const attachment = new AttachmentBuilder(buffer, { 
           name: `edited_image.${config.outputMimeType === 'image/png' ? 'png' : 'jpg'}` 
         });
         
         return {
           attachment,
           enhancedPrompt: generatedImage.enhancedPrompt,
           safetyAttributes: generatedImage.safetyAttributes
         };

       } catch (error) {
         console.error('Error editing image:', error);
         return null;
       }
     }

     /**
      * Upscale an image by a specified factor
      * @param {string|Buffer} imageData - Base64 string or Buffer of the image to upscale
      * @param {string} mimeType - MIME type of the input image
      * @param {string} upscaleFactor - Factor to upscale by ('x2' or 'x4')
      * @param {Object} options - Additional options
      */
     async upscaleImage(imageData, mimeType = 'image/jpeg', upscaleFactor = 'x2', options = {}) {
       try {
         // Convert Buffer to base64 if needed
         let imageBytes;
         if (Buffer.isBuffer(imageData)) {
           imageBytes = imageData.toString('base64');
         } else {
           imageBytes = imageData;
         }

         const image = {
           imageBytes: imageBytes,
           mimeType: mimeType
         };

         const config = {
           outputMimeType: options.outputMimeType || mimeType,
           includeRaiReason: true,
           enhanceInputImage: options.enhanceInputImage || false,
           imagePreservationFactor: options.imagePreservationFactor || undefined,
           ...options.config
         };

         const result = await this.AI2.models.upscaleImage({
           model: "imagen-3.0-generate-002",
           image: image,
           upscaleFactor: upscaleFactor,
           config: config
         });

         if (!result?.generatedImages || result.generatedImages.length === 0) {
           console.error('No upscaled images found in response');
           return null;
         }

         const generatedImage = result.generatedImages[0];
         
         if (generatedImage.raiFilteredReason) {
           console.warn('Upscaled image was filtered:', generatedImage.raiFilteredReason);
           return null;
         }

         if (!generatedImage.image?.imageBytes) {
           console.error('No image bytes found in upscaled image');
           return null;
         }

         const buffer = Buffer.from(generatedImage.image.imageBytes, 'base64');
         const attachment = new AttachmentBuilder(buffer, { 
           name: `upscaled_image_${upscaleFactor}.${config.outputMimeType === 'image/png' ? 'png' : 'jpg'}` 
         });
         
         return {
           attachment,
           upscaleFactor: upscaleFactor,
           safetyAttributes: generatedImage.safetyAttributes
         };

       } catch (error) {
         console.error('Error upscaling image:', error);
         return null;
       }
     }

    createAttachmentFromInlineData(imageData) {
      if (!imageData?.data || !imageData?.mimeType) {
        console.error('Missing required image data or mime type');
        return null;
      }

      try {
        const buffer = Buffer.from(imageData.data, "base64");
        const ext = imageData.mimeType === "image/png" ? "png" : "jpg";
        return new AttachmentBuilder(buffer, { name: `generated_image.${ext}` });
      } catch (error) {
        console.error('Error creating attachment:', error);
        return null;
      }
    }

    formatGroundingSource(chunk) {
      if (chunk?.web?.uri) {
        return `[${chunk.web.title || chunk.web.uri}](<${chunk.web.uri}>)`;
      }
      const ctx = chunk?.retrievedContext;
      if (!ctx) return null;
      const meta = Object.fromEntries(
        (ctx.customMetadata || []).map((item) => [item.key, item.stringValue ?? item.numericValue])
      );
      if (meta.channel_id && meta.period_key) {
        return `<#${meta.channel_id}> ${meta.period_key}`;
      }
      return ctx.title || null;
    }

    async processResponse(result, botname) {
  let responseText = "Error: Could not extract AI response text."; // Default error message
  let candidate = null;

  // --- Start: Flexible path to candidate object ---
  if (result && result.response && result.response.candidates && result.response.candidates.length > 0) {
    candidate = result.response.candidates[0];
    // this.client.logger.log("GeminiAI: Found candidate via result.response.candidates[0]", "debug");
  } else if (result && result.candidates && result.candidates.length > 0) {
    candidate = result.candidates[0];
    // this.client.logger.log("GeminiAI: Found candidate via result.candidates[0]", "debug");
  }
  // --- End: Flexible path to candidate object ---

  // --- Start: Modified text extraction to concatenate ALL text parts ---
  if (candidate) {
    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
      const textParts = candidate.content.parts.filter(part =>
        part && typeof part.text === 'string' && part.text.trim() !== ""
      );

      if (textParts.length > 0) {
        // Concatenate the text from all found text parts, separated by a space
        responseText = textParts.map(part => part.text.trim()).join(' ').trim();
        // this.client.logger.log(`GeminiAI: Successfully concatenated text parts: "${responseText}"`, "debug");
      } else {
        this.client.logger.warn("GeminiAI: No suitable text parts found in API response candidate's parts.", { parts: JSON.stringify(candidate.content.parts), candidateKeys: Object.keys(candidate) });
        // responseText remains the default error message
      }
    } else {
      this.client.logger.warn("GeminiAI: API response candidate missing content or parts.", { candidateKeys: Object.keys(candidate), contentKeys: candidate.content ? Object.keys(candidate.content) : 'null' });
      // responseText remains the default error message
    }
  } else {
    this.client.logger.error("GeminiAI: Invalid or incomplete API response structure (no valid candidate found).", { resultKeys: result ? Object.keys(result).join(', ') : 'null' });
    // responseText remains the default error message
  }
  // --- End: Modified text extraction ---

  // Note: Regex-based reasoning stripping is intentionally removed.

  let image = null;
  // Image prompt extraction - operates on the extracted responseText
  if (responseText.startsWith("Error:")) {
    // Do not attempt image prompt extraction if responseText is an error message
  } else if (responseText.includes("Processing image of") || responseText.includes("Generating image of")) {
    const keyword = responseText.includes("Processing image of") ? "Processing image of" : "Generating image of";
    const keywordParts = responseText.split(keyword);
    if (keywordParts.length > 1 && keywordParts[1]) {
        const imagePartCandidate = keywordParts[1].split("\n")[0];
        image = imagePartCandidate.trim();
    }
  }

  // Standard cleanup - operates on the extracted responseText
  // Only apply cleanup if not an error message, or be selective
  if (!responseText.startsWith("Error:")) {
    if (responseText.endsWith('||SEPARATE||')) {
      responseText = responseText.slice(0, -12);
    }
    const userIdTag = "<@" + this.client.user.id + ">";
    if (responseText.startsWith(userIdTag)) {
      responseText = responseText.replace(userIdTag + ": ", "");
    }
    if (botname && responseText.startsWith(botname + ": ")) {
      responseText = responseText.replace(botname + ": ", "");
    }
    if (responseText.startsWith('"') && responseText.endsWith('"')) {
      responseText = responseText.substring(1, responseText.length - 1);
    }
  }

  let finalResponseText = responseText;

  if (candidate && candidate.groundingMetadata?.groundingChunks && !finalResponseText.startsWith("Error:")) {
    const sources = [];
    const seen = new Set();
    for (const chunk of candidate.groundingMetadata.groundingChunks) {
      const source = this.formatGroundingSource(chunk);
      if (!source || seen.has(source)) continue;
      seen.add(source);
      sources.push(source);
    }
    if (sources.length > 0) {
      if (!finalResponseText.includes("||SEPARATE||Sources:")) {
        finalResponseText += "||SEPARATE||Sources: ";
      } else if (!finalResponseText.endsWith(" ")) {
        finalResponseText += " ";
      }
      finalResponseText += sources.join(" ");
    }
  }

  let imageResponse = null;
  if (image) {
    imageResponse = await this.generateImageNew(`generate an image of ${image}`);
  }

  return { response: finalResponseText, imageResponse };
}
}

module.exports = { createGeminiAI }