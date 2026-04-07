import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { readSchedule } from "../data.js";
import { currentYearMonth, getSlotForYearMonth } from "../rotation.js";
import { formatSlot } from "../types.js";
import { buildBookSourceLinks } from "../book-links.js";

export default {
  data: new SlashCommandBuilder()
    .setName("current")
    .setDescription("Show who is picking the book this month"),

  async execute(interaction) {
    const schedule = readSchedule();
    const { year, month } = currentYearMonth();
    const slot = getSlotForYearMonth(schedule.rotation, year, month);
    const label = formatSlot(year, month);

    if (!slot) {
      await interaction.reply({
        content: `No one is assigned to ${label} yet.`,
        ephemeral: true,
      });
      return;
    }

    const member = schedule.members.find((m) => m.discordId === slot.memberId);
    const name = member?.name ?? `<@${slot.memberId}>`;

    const lines = [
      `**${name}** (<@${slot.memberId}>) is picking the book for **${label}**.`,
    ];
    if (slot.pin) lines.push("📌 *(pinned slot)*");
    if (slot.bookUrl) {
      const bookDisplay = slot.bookTitle ?? slot.bookUrl;
      lines.push(`\n📖 **Book:** ${bookDisplay}`);
      if (slot.bookTitle) {
        const sourceLinks = buildBookSourceLinks({
          bookUrl: slot.bookUrl,
          bookTitle: slot.bookTitle,
        });
        lines.push(
          `🔗 **Sources:**\n${sourceLinks
            .map((l) => `- [${l.label}](${l.url})`)
            .join("\n")}`
        );
      }
    } else {
      lines.push(`\n*No book picked yet — use \`/pick\` to set one.*`);
    }

    const embed = new EmbedBuilder({
      title: `📚 This Month: ${label}`,
      description: lines.join("\n"),
      color: 0x5865f2,
    });

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
