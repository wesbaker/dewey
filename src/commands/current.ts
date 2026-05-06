import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { readSchedule } from "../data.js";
import { currentYearMonth, getSlotForYearMonth } from "../rotation.js";
import { formatSlot } from "../types.js";
import { buildBookEmbed } from "../book-embed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("current")
    .setDescription("Show who is picking the book this month"),

  async execute(interaction) {
    await interaction.deferReply();

    const schedule = readSchedule();
    const { year, month } = currentYearMonth();
    const slot = getSlotForYearMonth(schedule.rotation, year, month);
    const label = formatSlot(year, month);

    if (!slot) {
      await interaction.editReply(`No one is assigned to ${label} yet.`);
      return;
    }

    const member = schedule.members.find((m) => m.discordId === slot.memberId);
    const embed = buildBookEmbed({
      slot,
      member,
      label,
      embedTitle: `📚 This Month: ${label}`,
    });

    await interaction.editReply({ embeds: [embed] });
  },
} satisfies Command;
