const Command = require('../../base/Command.js')

const isAlpha = (ch) => {
    return /^[a-zA-Z]$/i.test(ch)
}

const numberToString = (number) => {
    let value = "";

    switch (number) {
      case "0":
        value = ":zero :";
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
  };

class SayBig extends Command {
    constructor(client){
        super(client, {
            name: "saybig",
            description: "Make Bender Yell.",
            category: "Fun",
            usage: "!saybig bender is great.",
            enabled: true,
            guildOnly: false,
            allMessages: false,
            showHelp: true,
            aliases: [],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            const sayMessage = args.join(" ").toLowerCase()
            const numbers = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
            var output = ""
            for (let i = 0; i < sayMessage.length; i++) {
                const char = sayMessage.charAt(i)
                if (char === " ") output += "   "
                else if (numbers.includes(char)) output += numberToString(char)
                else if (isAlpha(char))output += `:regional_indicator_${char}: `
                else output += `${char} `
            }
            message.delete().catch(O_o=>{})
            message.channel.send(output)
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = SayBig