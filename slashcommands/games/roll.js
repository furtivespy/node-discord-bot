const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const Roller = require("roll");
const diceSides = [
  "<:die1:790027072998342666>",
  "<:die2:790028311756668960>",
  "<:die3:790028312167841803>",
  "<:die4:790028312348065842>",
  "<:die5:790028312386076713>",
  "<:die6:790028312495128616>",
];

class Roll extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "roll",
      description: "Roll some dice",
      usage: "role",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("dice")
          .setDescription('What dice to roll? e.g. "d20+5" or "4d6"')
          .setRequired(true)
      );
  }

  async execute(interaction) {
    try {
      let roll = new Roller();
      let dice = interaction.options.getString("dice");

      if (roll.validate(dice)) {
        await interaction.deferReply();
        let rolling = roll.roll(dice);
        let description = `Total rolled: **${rolling.result}**`;
        // if (dice.slice(-2) == "d6") {
        //     description += `\n\n`
        //     for (let i = 0; i < rolling.rolled.length; i++) {
        //         description += `${diceSides[rolling.rolled[i] - 1]}`
        //     }
        // }
        let embedItem = {
          title: rolling.input.toString(),
          description: description,
          color: 4130114,
          footer: {
            text: `Individual rolled dice: ${rolling.rolled}`,
          },
        };
        try {
          let img = await super.getRandomGoogleImg(
            `number ${rolling.result}`,
            false,
            true
          );
          embedItem.thumbnail = {
            url: img.link,
          };
        } catch (e) {
          this.client.logger.log(e, "error");
        }
        await interaction.editReply({ embeds: [embedItem] });
      } else {
        await interaction.reply({
          content: `I don't know how to roll ${interaction.options.getString(
            "dice"
          )}`,
          ephemeral: true,
        });
      }
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }
}

module.exports = Roll;
