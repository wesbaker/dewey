import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { buildNextPreview } from "../next-preview.js";

export default {
  data: new SlashCommandBuilder()
    .setName("next")
    .setDescription("Show who picks the book next month"),

  async execute(interaction) {
    const preview = buildNextPreview();

    if (!preview.reply.embeds) {
      await interaction.reply(preview.reply);
      return;
    }

    const embed = EmbedBuilder.from(preview.reply.embeds[0]);
    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
