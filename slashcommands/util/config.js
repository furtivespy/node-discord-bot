const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const { PermissionsBitField } = require("discord.js");
const Pull = require('lodash/pull')

const configsThatMatter = [
  {
    name: "botPrefix",
    description: "The prefix for the bot (for older commands)",
  },
  {
    name: "randomResponsePercent",
    description:
      "The chance of a random response from the bot - not using AI, just Markov chains",
  },
  {
    name: "markovLevel",
    description:
      "The level of markov chains to use - Starts at 3, max of 5. Higher numbers is better change of something good being said, but need more data (gained for just being around and reading messages)",
  },
  { name: "enableCommand", description: "Enable an older command" },
  { name: "disableCommand", description: "Disable an older command" },
];

const listOfCommands = [
  {
    name: "Bringo - a bingo like game with words in everyday conversations",
    command: "bringo"
  },
  { name: "Ferengi - Responds with a rule of acquisition to money talk",
    command: "ferengi"
  },
  { name: "Frozen - reacts to 'frozen' messages with a snowman",
    command: "frozen"
  },

  
];

class Config extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "config",
      description: "Adjust bot settings",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addSubcommand((option) =>
        option.setName("list").setDescription("List all config options")
      )
      .addSubcommand((option) =>
        option
          .setName("botprefix")
          .setDescription("Get or set the bot prefix")
          .addStringOption((option) =>
            option
              .setName("prefix")
              .setDescription("The new prefix")
              .setRequired(false)
          )
      )
      .addSubcommand((option) =>
        option
          .setName("randomresponsepercent")
          .setDescription("Get or set the random response percent")
          .addIntegerOption((option) =>
            option
              .setName("percent")
              .setDescription("The new random response percent")
              .setRequired(false)
          )
      )

      .addSubcommand((option) =>
        option
          .setName("markovlevel")
          .setDescription("Get or set the markov level")
          .addStringOption((option) =>
            option
              .setName("level")
              .setDescription("The new markov level")
              .setRequired(false)
              .addChoices(
                { name: "3 Tokens", value: "3" },
                { name: "4 Tokens", value: "4" },
                { name: "5 Tokens", value: "5" }
              )
          )
      )
      .addSubcommand((option) =>
        option
          .setName("enablecommand")
          .setDescription("Enable an older command")
          .addStringOption((option) =>
            option
              .setName("command")
              .setDescription("The command to enable")
              .setRequired(true)
              .addChoices(
                listOfCommands.map((command) => ({
                  name: command.name,
                  value: command.command
                }))
              )
          )
      )
      .addSubcommand((option) =>
        option
          .setName("disablecommand")
          .setDescription("Disable an older command")
          .addStringOption((option) =>
            option
              .setName("command")
              .setDescription("The command to disable")
              .setRequired(true)
              .addChoices(
                listOfCommands.map((command) => ({
                  name: command.name,
                  value: command.command
                }))
              )
          )
      );
  }

  async execute(interaction) {
    try {
      switch (interaction.options.getSubcommand()) {
        case "list":
          await this.list(interaction);
          break;
        case "botprefix":
          await this.botPrefix(interaction);
          break;
        case "randomresponsepercent":
          await this.randomResponsePercent(interaction);
          break;
        case "markovlevel":
          await this.markovLevel(interaction);
          break;
        case "enablecommand":
          await this.enableCommand(interaction);
          break;
        case "disablecommand":
          await this.disableCommand(interaction);
          break;
      }
    } catch (e) {
      this.client.logger.log(e, "error");
    }
  }

  async list(interaction) {
    const settings = this.client.getSettings(interaction.guild);
    let listMessage = configsThatMatter
      .map((config) => {
        let value = '';
        if (config.name === 'botPrefix') {
          value = ` '[Current: ${settings.prefix}]'`;
        } else if (config.name === 'randomResponsePercent') {
          value = ` '[Current: ${settings.randRspPct}%]'`;
        } else if (config.name === 'markovLevel') {
          value = ` '[Current: ${settings.markovLevel}]'`;
        }
        return `${config.name}${" ".repeat(22 - config.name.length)}:: ${
          config.description
        }${value}`;
      })
      .join("\n");
    listMessage = `\`\`\`asciidoc\n= Config Commands =\n${listMessage}\`\`\``;
    await interaction.reply({ content: listMessage, ephemeral: true });
  }

  async botPrefix(interaction) {
    const settings = this.client.getSettings(interaction.guild);
    const prefix = interaction.options.getString("prefix");
    if (prefix) {
      if (!this.client.settings.has(interaction.guild.id)) this.client.settings.set(interaction.guild.id, {});
      this.client.settings.set(interaction.guild.id, prefix, "prefix");
      await interaction.reply({
        content: `Prefix set to: \`${prefix}\``,
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      content: `The current prefix is: \`${settings.prefix}\``,
      ephemeral: true,
    });
  }

  async randomResponsePercent(interaction) {
    const settings = this.client.getSettings(interaction.guild);
    const percent = interaction.options.getInteger("percent");
    if (percent != null) {
      if (percent < 0 || percent > 100) {
        await interaction.reply({
          content: "Random response percent must be between 0 and 100",
          ephemeral: true
        });
        return;
      }
      if (!this.client.settings.has(interaction.guild.id)) this.client.settings.set(interaction.guild.id, {});
      this.client.settings.set(interaction.guild.id, percent, "randRspPct");
      await interaction.reply({
        content: `Random response percent set to: \`${percent}\``,
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      content: `The current random response percent is: \`${settings.randRspPct}\``,
      ephemeral: true,
    });
  }

  async markovLevel(interaction) {
    const settings = this.client.getSettings(interaction.guild);
    const level = interaction.options.getString("level");
    if (level) {
      if (!this.client.settings.has(interaction.guild.id)) this.client.settings.set(interaction.guild.id, {});
      this.client.settings.set(interaction.guild.id, level, "markovLevel");
      await interaction.reply({
        content: `Markov level set to: \`${level}\``,
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      content: `The current markov level is: \`${settings.markovLevel}\``,
      ephemeral: true,
    });
  }

  async enableCommand(interaction) {
    const command = interaction.options.getString("command");
    const exclusions = this.client.getExclusions(interaction.guild)
    if (!exclusions.includes(command)) {
      await interaction.reply({ content: "This command is already enabled", ephemeral: true });
      return;
    }
    Pull(exclusions, command)
    this.client.setExclusions(interaction.guild, exclusions);
    await interaction.reply({
      content: `Command enabled: \`${command}\``,
      ephemeral: true,
    });

  }

  async disableCommand(interaction) {
    const command = interaction.options.getString("command");
    const exclusions = this.client.getExclusions(interaction.guild)
    if (exclusions.includes(command)) {
      await interaction.reply({ content: "This command is already disabled", ephemeral: true });
      return;
    }
    exclusions.push(command)
    this.client.setExclusions(interaction.guild, exclusions);
    await interaction.reply({
      content: `Command disabled: \`${command}\``,
      ephemeral: true,
    });
  }
}

module.exports = Config;
