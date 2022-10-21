const SlashCommand = require('../../base/SlashCommand.js')
const { SlashCommandBuilder } = require('@discordjs/builders');
const leet = require('leet')
const flip = require('flip');
const luni = require('../../modules/lunicode')

class Say extends SlashCommand {
    constructor(client){
        super(client, {
            name: "say",
            description: "Make the bot say something",
            usage: "Say it",
            enabled: true,
            permLevel: "User"
          })
        this.data = new SlashCommandBuilder()
            .setName(this.help.name)
            .setDescription(this.help.description)
            .addSubcommand(subcommand => 
                subcommand
                    .setName('something')
                    .setDescription('Robot will say what you tell it to')
                    .addStringOption(option => option.setName('message').setDescription('The message to say').setRequired(true))
                    )
            .addSubcommand(subcommand => 
                subcommand
                    .setName('tiny')
                    .setDescription('Say it with tiny capitals')
                    .addStringOption(option => option.setName('message').setDescription('The message to say').setRequired(true))
                    )
            .addSubcommand(subcommand => 
                subcommand
                    .setName('big')
                    .setDescription('Say it with big emoji letters')
                    .addStringOption(option => option.setName('message').setDescription('The message to say').setRequired(true))
                    )
            .addSubcommand(subcommand => 
                subcommand
                    .setName('bubbles')
                    .setDescription('Say it in bubbles')
                    .addStringOption(option => option.setName('message').setDescription('The message to say').setRequired(true))
                    )
            .addSubcommand(subcommand => 
                subcommand
                    .setName('mirror')
                    .setDescription('Say it backwards')
                    .addStringOption(option => option.setName('message').setDescription('The message to say').setRequired(true))
                    )
            .addSubcommand(subcommand => 
                subcommand
                    .setName('flipped')
                    .setDescription('Say it upside down')
                    .addStringOption(option => option.setName('message').setDescription('The message to say').setRequired(true))
                    )
            .addSubcommand(subcommand => 
                subcommand
                    .setName('leet')
                    .setDescription('Say it like a hacker')
                    .addStringOption(option => option.setName('message').setDescription('The message to say').setRequired(true))
                    )
            .addSubcommand(subcommand => 
                subcommand
                    .setName('creepy')
                    .setDescription('Say it creepy')
                    .addStringOption(option => option.setName('message').setDescription('The message to say').setRequired(true))
                    )
            .addSubcommand(subcommand => 
                subcommand
                    .setName('bent')
                    .setDescription('Say it wonky')
                    .addStringOption(option => option.setName('message').setDescription('The message to say').setRequired(true))
                    )
            
    }

    async execute(interaction) {
        try {
            let theMessage = interaction.options.getString('message').toString()

            switch (interaction.options.getSubcommand()){
                case "big":
                    const numbers = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
                    var output = ""
                    for (let i = 0; i < theMessage.length; i++) {
                        const char = theMessage.charAt(i)
                        if (char === " ") output += "   "
                        else if (numbers.includes(char)) output += numberToString(char)
                        else if (isAlpha(char)) output += `:regional_indicator_${char}: `
                        else output += `${specialCheck(char)} `
                    }
                    theMessage = output
                    break
                case "tiny":
                    theMessage = luni.tools.tiny.encode(theMessage)
                    break;
                case "mirror":
                    theMessage = luni.tools.mirror.encode(theMessage)
                    break;
                case "bubbles":
                    theMessage = luni.tools.bubbles.encode(theMessage)
                    break;
                case "leet":
                    theMessage = leet.convert(theMessage)
                    break
                case "flipped":
                    theMessage = flip(theMessage)
                    break
                case "creepy":
                    theMessage = luni.tools.creepify.encode(theMessage)
                    break;
                case "bent":
                    theMessage = luni.tools.bent.encode(theMessage)
                    break;
            }

            await interaction.reply({ content: theMessage })
            
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

const isAlpha = (ch) => {
    return /^[a-zA-Z]$/i.test(ch)
}

const numberToString = (number) => {
    let value = "";

    switch (number) {
      case "0":
        value = ":zero: ";
        break;

      case "1":
        value = ":one: ";
        break;

      case "2":
        value = ":two: ";
        break;

      case "3":
        value = ":three: ";
        break;

      case "4":
        value = ":four: ";
        break;

      case "5":
        value = ":five: ";
        break;

      case "6":
        value = ":six: ";
        break;

      case "7":
        value = ":seven: ";
        break;

      case "8":
        value = ":eight: ";
        break;

      case "9":
        value = ":nine: ";
        break;
    }
    return value;
  }

  const specialCheck = (character) => {
    switch (character) {
      case "#":
        return ":hash:"
      case "*":
        return ":asterisk:"
      case "!":
        return ":exclamation:"
      case "?":
        return ":question:"
      case "-":
        return ":heavy_minus_sign:"
      case "+":
        return ":heavy_plus_sign:"
      case "$":
        return ":heavy_dollar_sign:"
      default:
        return character
    }
  }

module.exports = Say