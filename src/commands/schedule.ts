import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { MONTH_NAMES } from "../types.js";
import { readSchedule } from "../data.js";

export default {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Show the full year's book club rotation"),

  async execute(interaction) {
    const schedule = readSchedule();

    if (schedule.rotation.length === 0) {
      await interaction.reply({
        content:
          "No rotation set yet. An admin can use `/randomize` to generate one.",
        ephemeral: true,
      });
      return;
    }

    const memberMap = new Map(
      schedule.members.map((m) => [m.discordId, m.name])
    );

    const lines = schedule.rotation.map((slot) => {
      const name = memberMap.get(slot.memberId) ?? `<@${slot.memberId}>`;
      const pin = slot.pin ? " 📌" : "";
      return `**${MONTH_NAMES[slot.month]}**: ${name}${pin}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`📖 Book Club Schedule — ${schedule.year}`)
      .setDescription(lines.join("\n"))
      .setColor(0x5865f2);

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
