const Command = require('../../base/Command.js')

class Help extends Command {
    constructor(client){
        super(client, {
            name: "help",
            description: "Displays all the available commands for you.",
            category: "Utility",
            usage: "No usage provided.",
            enabled: true,
            guildOnly: true,
            allMessages: false,
            showHelp: true,
            aliases: ["h", "halp"],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        // If no specific command is called, show all filtered commands.
        if (!args[0]) {
          // Load guild settings (for prefixes and eventually per-guild tweaks)
          const settings = message.settings;
          
          // Filter all commands by which are available for the user's level, using the <Collection>.filter() method.
          const myCommands = message.guild ? 
            this.client.commands.filter(cmd => this.client.levelCache[cmd.conf.permLevel] <= level && cmd.conf.showHelp) : 
            this.client.commands.filter(cmd => this.client.levelCache[cmd.conf.permLevel] <= level && cmd.conf.showHelp && !cmd.conf.guildOnly);
          
          // Here we have to get the command names only, and we use that array to get the longest name.
          // This make the help commands "aligned" in the output.
          const commandNames = myCommands.keyArray();
          const longest = commandNames.reduce((long, str) => Math.max(long, str.length), 0);
          let currentCategory = "";
          let output = `= Command List =\n\n[Use ${this.client.config.defaultSettings.prefix}help <commandname> for details]\n`;
          const sorted = myCommands.array().sort((p, c) => p.help.category > c.help.category ? 1 :  p.help.name > c.help.name && p.help.category === c.help.category ? 1 : -1 );
          sorted.forEach( c => {
            const cat = c.help.category;
            if (currentCategory !== cat) {
              output += `\u200b\n== ${cat} ==\n`;
              currentCategory = cat;
            }
            output += `${settings.prefix}${c.help.name}${" ".repeat(longest - c.help.name.length)} :: ${c.help.description}\n`;
          });
          message.channel.send(output, {code:"asciidoc", split: { char: "\u200b" }});
        } else {
          // Show individual command's help.
          let command = args[0];
          const cmd = this.client.commands.get(command) || this.client.commands.get(this.client.aliases.get(command));
          if (!cmd) return;
          if (level < this.client.levelCache[cmd.conf.permLevel]) return;
          message.channel.send(`= ${cmd.help.name} = \n${cmd.help.description}\nusage:: ${cmd.help.usage}\nalises:: ${cmd.conf.aliases.join(", ")}`, {code:"asciidoc"});
        }
      }
}

module.exports = Help