const Command = require('../../base/Command.js')
const Pull = require('lodash/pull')
var AsciiTable = require('ascii-table')
var wrap = require('word-wrap')

class Oversee extends Command {
    constructor(client){
        super(client, {
            name: "oversee",
            description: "Add or remove command exclusions.",
            category: "Utility",
            usage: "Oversee <add/remove> <command> or just 'Oversee' to get a list of all commands",
            enabled: true,
            guildOnly: true,
            allMessages: false,
            showHelp: false,
            aliases: ["exclude", "exclusion"],
            permLevel: "Administrator"
          })
    }

    async run (message, [action, cmdName, ...value], level) { // eslint-disable-line no-unused-vars

        const exclusions = this.client.getExclusions(message.guild)
        
        if (action === "add") {
            if (!cmdName) return message.reply("Please specify a command to exclude");
            const command = cmdName.toLowerCase()
            const cmd = this.client.commands.get(command) || this.client.commands.get(this.client.aliases.get(command));
            if (!cmd) return message.reply("This command does not exist");
            if (exclusions.includes(cmd.help.name)) return message.reply("This command is already excluded");
            if (cmd.help.name === 'oversee') return message.reply("Excluding that would be no good")
            exclusions.push(cmd.help.name)
            this.client.setExclusions(message.guild, exclusions)
            message.reply(`successfully excluded ${cmd.help.name}`);
        } else if (action === "remove" || action === "del") {
            if (!cmdName) return message.reply("Please specify a command to unexclude");
            const command = cmdName.toLowerCase()
            const cmd = this.client.commands.get(command) || this.client.commands.get(this.client.aliases.get(command));
            if (!cmd) return message.reply("This command does not exist");
            if (!exclusions.includes(cmd.help.name)) return message.reply("This command was not excluded");
            Pull(exclusions, cmd.help.name)
            this.client.setExclusions(message.guild, exclusions)
            message.reply(`successfully unexcluded ${cmd.help.name}`);
        } else {
            //if not add/remove then list all commands and status
            var table = new AsciiTable('[All Commands]')
            table.setHeading('{Category:}', '{Command:}', '{Permission:}', '{Active:}', '{Description:}')
            const myCommands = this.client.commands.filter(cmd => cmd.conf.enabled) 
            const sorted = myCommands.array().sort((p, c) => p.help.category > c.help.category ? 1 :  p.help.name > c.help.name && p.help.category === c.help.category ? 1 : -1 );

            sorted.forEach(acommand => {
                if(table.toString().length > 1600){
                    message.channel.send(table.toString(), {code:"css"})
                    table.clear()   
                }
                table.addRow(
                    acommand.help.category,
                    acommand.help.name,
                    acommand.conf.permLevel,
                    (exclusions.includes(acommand.help.name)) ? '[NO]' : '.Yes',
                    wrap(acommand.help.description, {width: 25})
                )
            })
            message.channel.send(table.toString(), {code:"css"})
        }
      }
    }

module.exports = Oversee