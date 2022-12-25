const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const fetch = require("node-fetch");
const { EmbedBuilder } = require("discord.js");
const RandomColor = require("randomcolor");

class Riddle extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "riddle",
      description:
        "Riddle me this, riddle me that, who is afraid of the big bad cat?",
      usage: "Play the puzzle hunt game",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("guess")
          .setDescription(
            "Enter your guess for the riddle/puzzle/hunted item (or leave blank for a fun riddle)"
          )
      );
  }

  async execute(interaction) {
    try {
      const answer = interaction.options.getString("guess")?.toLowerCase();
      let embed = new EmbedBuilder().setColor(RandomColor())
      let isEphemeral = answer ? true : false;


      switch (answer) {
        case "":
        case null:
        case undefined:
          let res = await fetch("https://riddles-api.vercel.app/random");
          let response = await res.json();

          embed = embed
            .setDescription(
              `${response.riddle}\n\n\n **Answer:** ||${response.answer}||`
            );
          break;
        case "begin":
        case "beginning":
          embed = embed
            .setDescription(`Looking for a beginning, but not with the right terms :wink:`);
          break;
        case "start":
          embed = embed
            .setDescription(`Welcome, brave traveler. You have come seeking knowledge and guidance from me, ` +
            `but before I impart upon you the secrets of the ages, I must first determine if you are worthy ` +
            `of such a gift. Your journey to enlightenment will not be easy, ` +
            `and I must ensure that you are up to the task.\n\n` +
            `But do not despair, for I have devised a test to measure your worthiness and your potential. ` +
            `I call it the Scavenger's Quest, and it is a series of challenges and riddles that will test ` +
            `your wit, your courage, and your resourcefulness. If you are able to solve the riddles ` +
            `and overcome the challenges that lie ahead, then perhaps you are worthy ` +
            `of the knowledge and wisdom that I possess.\n\n` +
            `So, if you are ready to embark on this journey, then follow me. The Scavenger's Quest awaits, ` +
            `and your fate hangs in the balance.\n\n` +
            `To continue, use "number one" as your answer.`);
          break;
        case "number one":
        case "numberone":
          embed = embed
            .setDescription(`You have chosen wisely. The first challenge awaits you.\n\n` +
            `You are standing in a room. There is a door to your left and a door to your right. ` +
            `\n\n` +
            `oh, and there's a christmas tree in front of you.\n\n` +
            `You'll find your fist clue in the tree. Solve the riddle to continue.`);
              break;
        case "christmas tree":
        case "christmastree":
          embed = embed
            .setDescription(`yes, look in the christmas tree!`);
          break;
        case "christmas":
        case "xmas":
        case "santa":
        case "santa claus":
        case "santaclaus":
          embed = embed
            .setDescription(`You don't think I'd give you a riddle that easy, do you?`);
          break;
        case "fence":
          embed = embed
            .setDescription(`Correct!\n\n` +
            `It seems you can handle riddles. Let's see if you can handle a challenge.\n\n` +
            `to find the next puzzle, solve the riddle below:\n\n` +
            `I wash your clothes, but I'm not a machine. Pour a cup of me if you want your duds clean!`)
          break;
        case "laundry detergent":
        case "laundrydetergent":
        case "detergent":
          embed = embed
            .setDescription(`maybe... did you check?`);
          break;
        case "cloistered":
          embed = embed
            .setDescription(`Correct!\n\n` +
            `You have done well so far. But can you handle a more scavenging challenge?\n\n` +
            `After each location is searched and 3 letters are found, enter the letters in alphabetical order to continue.\n\n` +
            `Location 1: If you find me in a road, you'll have a decision to make. If you find me in a drawer, you'll be ready to eat cake`)
          break;
        case "aen":
          embed = embed
            .setDescription(`Correct!\n\n` +
            `Location 2:  Stay tuned for this next clue. I have strings that can't be tied.`)
            break;
        case "aeo":
          embed = embed
            .setDescription(`Correct!\n\n` +
            `Location 3: You might say I'm popular - I always have the most dates.`)
            break;
        case "afo":
          embed = embed
            .setDescription(`Correct!\n\n` +
            `Location 4: I have lots of stars, but I'm not the sky. I'll be sitting here quietly until you need me.`)
            break;
        case "bir":
          embed = embed
            .setDescription(`Correct!\n\n` +
            `Location 5: Bread goes inside of me but never comes out. If I start smoking, you're bound to shout!`)
            break;
        case "clr":
          embed = embed
            .setDescription(`Correct!\n\n` +
            `Now you've found all be the final letters, I think it's time to test if you can handle a puzzle with multiple layers.\n\n` +
            `You next puzzle is hidden with your "souvenirs" from "The building that has the most stories."`)
            break;
        case "goodbye farewell and amen":
        case "goodbye":
        case "farewell":
        case "amen":
        case "goodbyefarewellandamen":
          embed = embed
            .setDescription(`You're not quite there yet... you don't have the *whole* answer`)
          break;
        case "lyric":
          embed = embed
          .setDescription(`Nice one!\n\n` +
          `Ok, you'll find the next puzzle in Will's work backpack. (I wanted at least one that was easy to hide.)`)
          break;
        case "pirates of penzance":
        case "piratesofpenzance":
          embed = embed
            .setDescription(`Correct!\n\n` +
            `Just one more puzzle to go! This one is a bit cryptic, but I'm sure you can figure it out.\n\n` +
            `To get ahold of the next puzzle, you'll need to think like a pirate. ` +
            `then you know what you're searching for. It wont be in a chest, but there is a chest nearby.`)
          break;
        case "entomology":
          embed = embed
            .setDescription(`Correct!\n\n` +
            `You're almost there! The last set of letters is hidden on ice. ` + 
            `put them with the others to make a 4 word phrase.`)
          break;
        case "a clause for celebration":
          embed = embed
            .setDescription(`WOOO HOOO!\n\n` +
            `You've made it to the end of the scavenger hunt! You've earned the right to know the secret of the ages.\n\n` +
            `And by secret of the ages, I mean what your final gift is.\n\n` +
            `FYI, i asked an AI to finish this part and it suggested "the secret of the ages is that I'm a nerd and I like to hide things in my house."`)
          break;
        default:
          embed = embed
            .setDescription(`Sorry, that's not it!\n\nTry again.`);
      }

      interaction.reply({ embeds: [embed], ephemeral: isEphemeral });
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }
}

module.exports = Riddle;
