import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { formatSlot } from "../types.js";
import { readSchedule } from "../data.js";
import { getSlotForYearMonth, nextActiveFromNow } from "../rotation.js";

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

    const { year, month } = nextActiveFromNow();
    const slot = getSlotForYearMonth(schedule.rotation, year, month);

    if (!slot) {
      await interaction.reply({
        content: `No one is assigned to ${formatSlot(year, month)} yet. An admin can use \`/randomize\` to fill it in.`,
        ephemeral: true,
      });
      return;
    }

    const member = schedule.members.find(
      (m) => m.discordId === slot.memberId
    );
    const name = member?.name ?? `<@${slot.memberId}>`;
    const label = formatSlot(year, month);

    const lines = [
      `**${name}** (<@${slot.memberId}>) is picking the book for **${label}**.`,
    ];
    if (slot.pin) lines.push("📌 *(pinned slot)*");
    if (slot.bookUrl) {
      lines.push(`\n📖 **Book picked:** ${slot.bookUrl}`);
    } else {
      lines.push(`\n*No book picked yet — use \`/pick\` to set one.*`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`📚 Next Up: ${label}`)
      .setDescription(lines.join("\n"))
      .setColor(0x57f287);

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
