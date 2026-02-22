import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { formatSlot } from "../types.js";
import { readSchedule } from "../data.js";
import { currentYearMonth } from "../rotation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Show the book club rotation"),

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

    const { year: nowYear, month: nowMonth } = currentYearMonth();
    const memberMap = new Map(
      schedule.members.map((m) => [m.discordId, m.name])
    );

    // Show current + future slots only
    const futureSlots = schedule.rotation.filter(
      (s) => s.year > nowYear || (s.year === nowYear && s.month >= nowMonth)
    );

    if (futureSlots.length === 0) {
      await interaction.reply({
        content:
          "All scheduled months are in the past. An admin can use `/randomize` to fill in upcoming months.",
        ephemeral: true,
      });
      return;
    }

    const lines = futureSlots.map((slot) => {
      const name = memberMap.get(slot.memberId) ?? `<@${slot.memberId}>`;
      const pin = slot.pin ? " 📌" : "";
      const current =
        slot.year === nowYear && slot.month === nowMonth
          ? " ← *this month*"
          : "";
      return `**${formatSlot(slot.year, slot.month)}**: ${name}${pin}${current}`;
    });

    const embed = new EmbedBuilder()
      .setTitle("📖 Book Club Schedule")
      .setDescription(lines.join("\n"))
      .setColor(0x5865f2);

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
