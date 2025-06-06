const {
  Client,
  Collection,
  Partials,
  GatewayIntentBits,
  PermissionsBitField,
} = require("discord.js");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const Enmap = require("enmap");
const klaw = require("klaw");
const path = require("path");
const database = require("./db/db.js");
const { createGeminiAI } = require("./modules/geminiai.js")
const enmapDataDir = process.env.IS_ON_FLY ? "/data" : "./data";

class BenderBot extends Client {
  constructor(options) {
    super(options);
    this.config = require("./config.js");
    this.permLevels = require("./config.permissionLevels.js");
    this.settings = new Enmap({
      name: "settings",
      cloneLevel: "deep",
      fetchAll: false,
      autoFetch: true,
      dataDir: enmapDataDir,
    });
    this.exclusions = new Enmap({
      name: "exclusions",
      cloneLevel: "deep",
      fetchAll: false,
      autoFetch: true,
      dataDir: enmapDataDir,
    });
    this.gamedata = new Enmap({
      name: "gamedata",
      cloneLevel: "deep",
      fetchAll: false,
      autoFetch: true,
      dataDir: enmapDataDir,
    });
    this.skipChannels = new Enmap({
      name: "skipChannels",
      cloneLevel: "deep",
      fetchAll: false,
      autoFetch: true,
      dataDir: enmapDataDir,
    });

    this.commands = new Collection();
    this.slashcommands = new Collection();
    this.aliases = new Collection();
    this.messageEvents = new Collection();
    this.guildDBs = {};

    //requiring the Logger class for easy console logging
    //this.logger = require("./modules/Logger.js");
    this.logger = require("./modules/bugsnagLogger.js")(this.config.bugsnagKey, this.config.releaseStage);

    // add geminiAI module
    this.geminiAI = createGeminiAI(this)
    // Basically just an async shortcut to using a setTimeout. Nothing fancy!
    this.wait = require("util").promisify(setTimeout);
  }

  permlevel(message) {
    let permlvl = 0;

    const permOrder = this.permLevels
      .slice(0)
      .sort((p, c) => (p.level < c.level ? 1 : -1));

    while (permOrder.length) {
      const currentLevel = permOrder.shift();
      if (message.guild && currentLevel.guildOnly) continue;
      if (currentLevel.check(message)) {
        permlvl = currentLevel.level;
        break;
      }
    }
    return permlvl;
  }

  loadCommand(commandPath, commandName) {
    try {
      const props = new (require(`${commandPath}${path.sep}${commandName}`))(
        this
      );
      this.logger.log(`Loading Command: ${props.help.name}. 👌`, "log");
      props.conf.location = commandPath;
      if (props.init) {
        props.init(this);
      }
      this.commands.set(props.help.name, props);
      props.conf.aliases.forEach((alias) => {
        this.aliases.set(alias, props.help.name);
      });
      return false;
    } catch (e) {
      return `Unable to load command ${commandName}: ${e}`;
    }
  }

  loadSlashCommand(commandPath, commandName) {
    try {
      const props = new (require(`${commandPath}${path.sep}${commandName}`))(
        this
      );
      this.logger.log(`Loading Slash Command: ${props.help.name}. 👌`, "log");
      this.slashcommands.set(props.help.name, props);
      return false;
    } catch (e) {
      return `Unable to load command ${commandName}: ${e}`;
    }
  }

  loadEvent(commandPath, commandName) {
    try {
      const props = new (require(`${commandPath}${path.sep}${commandName}`))(
        this
      );
      this.logger.log(`Loading Event: ${props.help.name}. 👌`, "log");
      props.conf.location = commandPath;
      if (props.init) {
        props.init(this);
      }
      this.messageEvents.set(props.help.name, props);
      return false;
    } catch (e) {
      return `Unable to load event ${commandName}: ${e}`;
    }
  }

  async unloadCommand(commandPath, commandName) {
    let command;
    if (this.commands.has(commandName)) {
      command = this.commands.get(commandName);
    } else if (this.aliases.has(commandName)) {
      command = this.commands.get(this.aliases.get(commandName));
    }
    if (!command)
      return `The command \`${commandName}\` doesn"t seem to exist, nor is it an alias. Try again!`;

    if (command.shutdown) {
      await command.shutdown(this);
    }
    delete require.cache[
      require.resolve(`${commandPath}${path.sep}${commandName}.js`)
    ];
    return false;
  }

  getDatabase(guildId) {
    if (this.guildDBs[guildId]) {
      return this.guildDBs[guildId];
    }
    this.guildDBs[guildId] = new database(guildId);
    return this.guildDBs[guildId];
  }
  /* SETTINGS FUNCTIONS
  These functions are used by any and all location in the bot that wants to either
  read the current *complete* guild settings (default + overrides, merged) or that
  wants to change settings for a specific guild.
  */

  // getSettings merges the client defaults with the guild settings. guild settings in
  // enmap should only have *unique* overrides that are different from defaults.
  getSettings(guild) {
    this.settings.ensure("default", this.config.defaultSettings);
    if (!guild) return this.settings.get("default");
    const guildConf = this.settings.get(guild.id) || {};
    return {
      ...this.settings.get("default"),
      ...guildConf,
    };
  }

  getExclusions(guild) {
    if (!guild) return [];
    const guildData = this.exclusions.get(guild.id) || [];
    return guildData;
  }
  setExclusions(guild, exclusionList) {
    this.exclusions.set(guild.id, exclusionList);
  }
  getSkipChannels(guild) {
    if (!guild) return [];
    const guildData = this.skipChannels.get(guild.id) || [];
    return guildData;
  }
  setSkipChannels(guild, skipChannelList) {
    this.skipChannels.set(guild.id, skipChannelList);
  }
  getGameData(guild, gameName) {
    const guildData = this.gamedata.get(guild.id) || {};
    return guildData[gameName] || {};
  }
  setGameData(guild, gameName, updatedData) {
    const guildData = this.gamedata.get(guild.id) || {};
    this.gamedata.set(
      guild.id,
      Object.assign(guildData, {
        [gameName]: updatedData,
      })
    );
  }
  /*
  SINGLE-LINE AWAITMESSAGE
  A simple way to grab a single reply, from the user that initiated
  the command. Useful to get "precisions" on certain things...
  USAGE
  const response = await client.awaitReply(msg, "Favourite Color?");
  msg.reply(`Oh, I really love ${response} too!`);
  */
  async awaitReply(msg, question, limit = 60000) {
    const filter = (m) => (m.author.id = msg.author.id);
    await msg.channel.send(question);
    try {
      const collected = await msg.channel.awaitMessages(filter, {
        max: 1,
        time: limit,
        errors: ["time"],
      });
      return collected.first().content;
    } catch (e) {
      return false;
    }
  }
}

const client = new BenderBot({
  
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.Guild,
    Partials.User,
  ]
});

const init = async () => {
  klaw("./commands").on("data", (item) => {
    const cmdFile = path.parse(item.path);
    if (!cmdFile.ext || cmdFile.ext !== ".js") return;
    const response = client.loadCommand(
      cmdFile.dir,
      `${cmdFile.name}${cmdFile.ext}`
    );
    if (response) client.logger.error(response);
  });

  klaw("./events").on("data", (item) => {
    const cmdFile = path.parse(item.path);
    if (!cmdFile.ext || cmdFile.ext !== ".js") return;
    const response = client.loadEvent(
      cmdFile.dir,
      `${cmdFile.name}${cmdFile.ext}`
    );
    if (response) client.logger.error(response);
  });

  klaw("./slashcommands").on("data", (item) => {
    const cmdFile = path.parse(item.path);
    if (!cmdFile.ext || cmdFile.ext !== ".js") return;
    const response = client.loadSlashCommand(
      cmdFile.dir,
      `${cmdFile.name}${cmdFile.ext}`
    );
    if (response) client.logger.error(response);
  });

  // Then we load events, which will include our message and ready event.
  // const evtFiles = await readdir("./events/");
  // client.logger.log(`Loading a total of ${evtFiles.length} events.`, "log");
  // evtFiles.forEach(file => {
  //   const eventName = file.split(".")[0];
  //   client.logger.log(`Loading Event: ${eventName}`);
  //   const event = new (require(`./events/${file}`))(client);
  //   // This line is awesome by the way. Just sayin'.
  //   client.on(eventName, (...args) => event.run(...args));
  //   delete require.cache[require.resolve(`./events/${file}`)];
  // });

  client.levelCache = {};
  for (let i = 0; i < client.permLevels.length; i++) {
    const thisLevel = client.permLevels[i];
    client.levelCache[thisLevel.name] = thisLevel.level;
  }

  client.on("ready", async () => {
    //nice to wait a sec before really being ready
    await client.wait(1000);

    client.user.setActivity(client.config.activity, {
      type: client.config.activityType,
    });
    client.appInfo = await client.application.fetch();
    setInterval(async () => {
      client.appInfo = await client.application.fetch();
    }, 60000);
    if (!client.settings.has("default")) {
      if (!client.config.defaultSettings)
        throw new Error(
          "defaultSettings not preset in config.js or settings database. Bot cannot load."
        );
      client.settings.set("default", client.config.defaultSettings);
    }

    await client.guilds.fetch();
    client.logger.log(
      `Bot has started, in ${client.guilds.cache.size} guilds.`,
      "ready"
    );

    client.guilds.cache.forEach(async (gld) => {
      await gld.members.fetch();
    });
    client.logger.log(`guild members cached`);

    //Register Slash Commands
    const cmds = client.slashcommands.map((sc) => sc.data.toJSON());
    const rest = new REST({
      version: "9",
    }).setToken(client.config.token);

    if (client.config.clientId == "548570412959662080") {
      //Test Server
      rest
        .put(
          Routes.applicationGuildCommands(
            client.config.clientId,
            "545109131330191371"
          ),
          {
            body: cmds,
          }
        )
        .then((response) => {
          client.logger.log("Successfully registered application commands.")
        })
        .catch((error) => client.logger.error(error));
    } else {
      //Prod Server
      rest
        .put(Routes.applicationCommands(client.config.clientId), {
          body: cmds,
        })
        .then((response) => {
          client.logger.log("Successfully registered application commands.");
          //client.logger.log(JSON.stringify(response, null, 2));
        })
        .catch((error) => client.logger.error(error));
    }
  });

  client.on("messageCreate", async (message) => {
    
    if (message.author.bot) return;

    // If message in in a server, see if bot can send to that channel, otherwise bot will ignore the messages
    if (message.guild) {
      if (
        !message.channel
          .permissionsFor(message.guild.members.me)
          .has(PermissionsBitField.Flags.SendMessages)
      )
        return;
    }

    const settings = client.getSettings(message.guild);
    message.settings = settings;

    // Checks if the bot was mentioned, with no message after it, returns the prefix.
    const prefixMention = new RegExp(`^<@!?${client.user.id}>( |)$`);
    if (message.content.match(prefixMention)) {
      return message.reply(`My prefix on this guild is \`${settings.prefix}\``);
    }
    // Also good practice to ignore any message that does not start with our prefix,
    // which is set in the configuration file.
    if (message.content.indexOf(settings.prefix) !== 0) return;
    var args = [];
    if (!message.guild) {
      args = message.content.trim().split(/ +/g);
    } else {
      args = message.content.slice(settings.prefix.length).trim().split(/ +/g);
    }
    const command = args.shift().toLowerCase();
    // If the member on a guild is invisible or not cached, fetch them.
    if (message.guild && !message.member)
      await message.guild.members.fetch(message.author);
    // Get the user or member's permission level from the elevation
    const level = client.permlevel(message);

    // Check whether the command, or alias, exist in the collections defined
    // in app.js.
    const cmd =
      client.commands.get(command) ||
      client.commands.get(client.aliases.get(command));
    // using this const varName = thing OR otherthign; is a pretty efficient
    // and clean way to grab one of 2 values!
    if (!cmd) return;
    // Some commands may not be useable in DMs. This check prevents those commands from running
    // and return a friendly error message.
    if (cmd && !message.guild && cmd.conf.guildOnly)
      return message.channel.send(
        "This command is unavailable via private message. Please run this command in a server."
      );
    //don't run a disabled command
    if (!cmd.conf.enabled) return;
    //dont run an exluced command
    const exclusions = client.getExclusions(message.guild);
    if (exclusions.includes(cmd.help.name)) return;
    //check permission level
    if (level < client.levelCache[cmd.conf.permLevel]) {
      if (settings.systemNotice === "true") {
        return message.channel
          .send(`You do not have permission to use this command.
        Your permission level is ${level} (${
          client.permLevels.find((l) => l.level === level).name
        })
        This command requires level ${client.levelCache[cmd.conf.permLevel]} (${
          cmd.conf.permLevel
        })`);
      } else {
        return;
      }
    }
    // To simplify message arguments, the author's level is now put on level (not member, so it is supported in DMs)
    // The "level" command module argument will be deprecated in the future.
    message.author.permLevel = level;
    message.command = command;

    message.flags = [];
    while (args[0] && args[0][0] === "-") {
      message.flags.push(args.shift().slice(1));
    }

    // If the command exists, **AND** the user has permission, run it.
    client.logger.log(
      `${client.permLevels.find((l) => l.level === level).name} ${
        message.author.username
      } (${message.author.id}) ran command ${cmd.help.name}`,
      "cmd"
    );
    //client.logger.log(`${message.author.username} (${message.author.id}) ran command ${cmd.help.name}`, "cmd");
    cmd.run(message, args, level);
  });

  console.log("Logging in...");
  client.login(client.config.token);
};

//run every message commands
client.on("messageCreate", async (message) => {
  
  if (message.author.bot) return;
  if (!message.guild) {
    return;
  }
  if (
    !message.channel.permissionsFor(message.guild.members.me).has(PermissionsBitField.Flags.SendMessages)
  )
    return;
  const settings = client.getSettings(message.guild);
  message.settings = settings;
  //Ignore actual commands or command attempts
  if (message.content.indexOf(settings.prefix) === 0) return;
  //args is each word now
  const args = message.content.trim().split(/ +/g);
  // If the member on a guild is invisible or not cached, fetch them.
  if (message.guild && !message.member)
    await message.guild.members.fetch(message.author);
  // Get the user or member's permission level from the elevation
  const level = client.permlevel(message);
  const exclusions = client.getExclusions(message.guild);
  const commandsToRun = client.commands.filter(
    (cmd) =>
      client.levelCache[cmd.conf.permLevel] <= level &&
      cmd.conf.enabled &&
      cmd.conf.allMessages &&
      !exclusions.includes(cmd.help.name)
  );
  commandsToRun.forEach((cmd) => {
    cmd.run(message, args, level);
  });
});

const events = {
  MESSAGE_REACTION_ADD: "messageReactionAdd",
  MESSAGE_REACTION_REMOVE: "messageReactionRemove",
};
/*
client.on('raw', async event => {
	if (!events.hasOwnProperty(event.t)) return;

	const { d: data } = event;
	const user = client.users.get(data.user_id);
	const channel = client.channels.get(data.channel_id) || await user.createDM();

	if (channel.messages.has(data.message_id)) return;

  const message = await channel.fetchMessage(data.message_id);
  
  const emoji = data.emoji.id ? `${data.emoji.name}:${data.emoji.id}` : data.emoji.name;
  // This gives us the reaction we need to emit the event properly, in top of the message object
  const reaction = message.reactions.get(emoji);
  // Adds the currently reacting user to the reaction's users collection.
  if (reaction) reaction.users.set(data.user_id, client.users.get(data.user_id));

	client.emit(events[event.t], reaction, user);
	//if (message.reactions.size === 1) message.reactions.delete(emojiKey);
});
*/
client.on("messageReactionAdd", async (reaction, user) => {
  if (reaction.partial) {
    await reaction.fetch();
  }
  if (!reaction.message.guild) {
    return;
  }
  const settings = client.getSettings(reaction.message.guild);
  reaction.settings = settings;
  //const level = client.permlevel(message);
  const exclusions = client.getExclusions(reaction.message.guild);
  const commandsToRun = client.messageEvents.filter(
    (cmd) =>
      cmd.help.eventType == "messageReactionAdd" &&
      !exclusions.includes(cmd.help.name) &&
      cmd.conf.enabled
  );
  commandsToRun.forEach((cmd) => {
    client.logger.log(`ran Event ${cmd.help.name}`, "cmd");
    cmd.run(reaction, user);
  });
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (reaction.partial) {
    await reaction.fetch();
  }
  if (!reaction.message.guild) {
    return;
  }
  const settings = client.getSettings(reaction.message.guild);
  reaction.settings = settings;
  //const level = client.permlevel(message);
  const exclusions = client.getExclusions(reaction.message.guild);
  const commandsToRun = client.messageEvents.filter(
    (cmd) =>
      cmd.help.eventType == "messageReactionRemove" &&
      !exclusions.includes(cmd.help.name) &&
      cmd.conf.enabled
  );
  commandsToRun.forEach((cmd) => {
    client.logger.log(`ran Event ${cmd.help.name}`, "cmd");
    cmd.run(reaction, user);
  });
});

client.on("interactionCreate", async (interaction) => {
  client.logger.log(`Slash Command ${interaction.commandName}`);
  if (!interaction.isCommand() && !interaction.isAutocomplete()) return;
  const command = client.slashcommands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    return interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }
});

init();

client
  .on("disconnect", () => client.logger.warn("Bot is disconnecting..."))
  .on("reconnecting", () => client.logger.log("Bot reconnecting...", "log"))
  .on("error", (e) => client.logger.error(e))
  .on("warn", (info) => client.logger.warn(info));

process.on("uncaughtException", (err) => {
  const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
  console.error("Uncaught Exception: ", errorMsg);
  // Always best practice to let the code crash on uncaught exceptions.
  // Because you should be catching them anyway.
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("Uncaught Promise Error: ", err);
});
