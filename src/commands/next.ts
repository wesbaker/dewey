import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { MONTH_NAMES } from "../types.js";
import { readSchedule } from "../data.js";
import { getSlotForMonth, nextActiveMonth } from "../rotation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("next")
    .setDescription("Show who picks the book next month"),

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

    const month = nextActiveMonth();
    const slot = getSlotForMonth(schedule.rotation, month);

    if (!slot) {
      await interaction.reply({
        content: `No one is assigned to ${MONTH_NAMES[month]} yet.`,
        ephemeral: true,
      });
      return;
    }

    const member = schedule.members.find((m) => m.discordId === slot.memberId);
    const name = member?.name ?? `<@${slot.memberId}>`;

    const embed = new EmbedBuilder()
      .setTitle(`📚 Next Up: ${MONTH_NAMES[month]}`)
      .setDescription(
        `**${name}** (<@${slot.memberId}>) is picking the book for **${MONTH_NAMES[month]}**.` +
          (slot.pin ? "\n📌 *(pinned slot)*" : "")
      )
      .setColor(0x57f287);

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
