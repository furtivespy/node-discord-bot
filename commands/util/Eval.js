const Command = require('../../base/Command.js')

const clean = text => {
    if (typeof(text) === "string")
      return text.replace(/`/g, "`" + String.fromCharCode(8203)).replace(/@/g, "@" + String.fromCharCode(8203)).substring(0,1998);
    else
        return text;
  }

class Eval extends Command {
    constructor(client){
        super(client, {
            name: "eval",
            description: "DANGER DANGER",
            category: "Utility",
            usage: "NO NO NO NO",
            enabled: true,
            guildOnly: true,
            allMessages: false,
            showHelp: true,
            aliases: [],
            permLevel: "Bot Owner"
          })
    }

    async run (message, args, level) {
        const { exec } = require('child_process');
        const code = args.join(" ")
        exec(code, (error, stdout, stderr) => {
        if (error) {
            message.channel.send(`\`ERROR\` \`\`\`xl\n${clean(error)}\n\`\`\``);
            console.error(`exec error: ${error}`);
            return;
        }
        message.channel.send(clean(stdout), {code:"xl"})
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
        });
        //         try {
        //     const code = args.join(" ");
        //     let evaled = eval(code);
       
        //     if (typeof evaled !== "string")
        //       evaled = require("util").inspect(evaled);
       
        //     message.channel.send(clean(evaled), {code:"xl"});
        //   } catch (err) {
        //     message.channel.send(`\`ERROR\` \`\`\`xl\n${clean(err)}\n\`\`\``);
        //   }       
    }
}

module.exports = Eval