import SlashCommand from "../../base/SlashCommand.js";

import { SlashCommandBuilder } from "@discordjs/builders";

export const SLOGAN_UNAVAILABLE = "Couldn't reach sloganizer right now.";

export function sloganUrl(item) {
  const params = new URLSearchParams({
    slogan: item,
  });
  return `http://www.sloganizer.net/en/outbound.php?${params}`;
}

class Slogan extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "slogan",
      description: "Come up with a cool slogan",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("item")
          .setDescription("The item to create a slogan for")
          .setRequired(true)
      );
  }

  async execute(interaction) {
    try {
      await interaction.deferReply();
      const item = interaction.options.getString("item");
      const response = await fetch(sloganUrl(item));
      if (!response.ok) {
        await interaction.editReply({ content: SLOGAN_UNAVAILABLE });
        return;
      }
      const data = (await response.text()).replace(/<.*?>/g, "").trim();
      if (!data) {
        await interaction.editReply({ content: SLOGAN_UNAVAILABLE });
        return;
      }
      await interaction.editReply(data);
    } catch (e) {
      this.client.logger.log(e, "error");
      try {
        await interaction.editReply({ content: SLOGAN_UNAVAILABLE });
      } catch (replyError) {
        this.client.logger.log(replyError, "error");
      }
    }
  }
}

export default Slogan;
