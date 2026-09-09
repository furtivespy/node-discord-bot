import SlashCommand from "../../base/SlashCommand.js";

import { SlashCommandBuilder } from "@discordjs/builders";


const MAX_NAME_LENGTH = 32;

class People extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "people",
      description: "Map Discord users to real names for chat understanding (bot owner only)",
      usage: "/people set user:@Shane name:Shane",
      enabled: true,
      permLevel: "Bot Owner",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set")
          .setDescription("Assign a real name to a user")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The Discord user")
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Their real name (for understanding, not nicknames)")
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("clear")
          .setDescription("Remove a user's real name mapping")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The Discord user")
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("whois")
          .setDescription("Show a user's mapped name and current nickname")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The Discord user")
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("list")
          .setDescription("List all mapped real names on this server")
      );
  }

  isBotOwner(userId) {
    return Boolean(this.client.config.botOwnerId) && this.client.config.botOwnerId === userId;
  }

  async execute(interaction) {
    try {
      if (!this.isBotOwner(interaction.user.id)) {
        await interaction.reply({
          content: "This command is only for the bot owner.",
          ephemeral: true,
        });
        return;
      }

      if (!interaction.guild) {
        await interaction.reply({
          content: "Use this command in a server.",
          ephemeral: true,
        });
        return;
      }

      switch (interaction.options.getSubcommand()) {
        case "set":
          await this.set(interaction);
          break;
        case "clear":
          await this.clear(interaction);
          break;
        case "whois":
          await this.whois(interaction);
          break;
        case "list":
          await this.list(interaction);
          break;
        default:
          await interaction.reply({
            content: "Unknown subcommand.",
            ephemeral: true,
          });
      }
    } catch (e) {
      this.client.logger.log(e, "error");
      const payload = {
        content: "Something went wrong with that people command.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }

  db(interaction) {
    return this.client.getDatabase(interaction.guild.id);
  }

  currentNick(interaction, user) {
    const member = interaction.guild.members.cache.get(user.id);
    return member?.displayName || user.globalName || user.username;
  }

  validateName(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return { error: "Name cannot be empty." };
    if (trimmed.length > MAX_NAME_LENGTH) {
      return { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
    }
    if (/[\n\r<>@]/.test(trimmed)) {
      return { error: "Name cannot include @, <, >, or line breaks." };
    }
    return { name: trimmed };
  }

  async set(interaction) {
    const user = interaction.options.getUser("user", true);
    const checked = this.validateName(interaction.options.getString("name", true));
    if (checked.error) {
      await interaction.reply({ content: checked.error, ephemeral: true });
      return;
    }

    this.db(interaction).setPersonName(user.id, checked.name);
    const nick = this.currentNick(interaction, user);
    await interaction.reply({
      content: `Mapped ${user} as **${checked.name}** (currently nicknamed **${nick}**). Chat will still use the nickname; this is just so the bot knows who they are.`,
      ephemeral: true,
    });
  }

  async clear(interaction) {
    const user = interaction.options.getUser("user", true);
    const removed = this.db(interaction).clearPersonName(user.id);
    await interaction.reply({
      content: removed
        ? `Removed the real name mapping for ${user}.`
        : `${user} did not have a real name mapped.`,
      ephemeral: true,
    });
  }

  async whois(interaction) {
    const user = interaction.options.getUser("user", true);
    const realName = this.db(interaction).getPersonName(user.id);
    const nick = this.currentNick(interaction, user);
    await interaction.reply({
      content: realName
        ? `${user} is **${realName}** (current nick: **${nick}**).`
        : `${user} has no real name mapped. Current nick: **${nick}**.`,
      ephemeral: true,
    });
  }

  async list(interaction) {
    const people = this.db(interaction).listPeople();
    if (people.length === 0) {
      await interaction.reply({
        content: "No real names mapped on this server yet. Use `/people set` to add one.",
        ephemeral: true,
      });
      return;
    }

    const lines = people.map((person) => {
      const member = interaction.guild.members.cache.get(person.user_id);
      const nick = member?.displayName || "unknown nick";
      return `- **${person.real_name}** — ${nick} (<@${person.user_id}>)`;
    });

    await interaction.reply({
      content: `Known people:\n${lines.join("\n")}`,
      ephemeral: true,
    });
  }
}

export default People;
