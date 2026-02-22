import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { formatSlot } from "../types.js";
import { readSchedule } from "../data.js";
import { currentYearMonth } from "../rotation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("Show past book club picks"),

  async execute(interaction) {
    const schedule = readSchedule();

    if (schedule.rotation.length === 0) {
      await interaction.reply({
        content: "No rotation history yet.",
        ephemeral: true,
      });
      return;
    }

    const { year: nowYear, month: nowMonth } = currentYearMonth();
    const memberMap = new Map(
      schedule.members.map((m) => [m.discordId, m.name])
    );

    // Past slots only (before current month)
    const pastSlots = schedule.rotation
      .filter(
        (s) => s.year < nowYear || (s.year === nowYear && s.month < nowMonth)
      )
      .reverse(); // most recent first

    if (pastSlots.length === 0) {
      await interaction.reply({
        content: "No past months in the rotation yet.",
        ephemeral: true,
      });
      return;
    }

    const lines = pastSlots.map((slot) => {
      const name = memberMap.get(slot.memberId) ?? `<@${slot.memberId}>`;
      const book = slot.bookTitle
        ? ` — [${slot.bookTitle}](${slot.bookUrl})`
        : slot.bookUrl
          ? ` — [book](${slot.bookUrl})`
          : "";
      return `**${formatSlot(slot.year, slot.month)}**: ${name}${book}`;
    });

    // Discord embeds have a 4096 char limit — truncate if needed
    let description = lines.join("\n");
    if (description.length > 4000) {
      const truncated = lines.slice(0, 20);
      description =
        truncated.join("\n") + `\n\n*…and ${lines.length - 20} more*`;
    }

    const embed = new EmbedBuilder()
      .setTitle("📜 Book Club History")
      .setDescription(description)
      .setColor(0xe67e22);

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
