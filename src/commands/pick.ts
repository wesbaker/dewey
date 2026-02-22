import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { MONTH_CHOICES, formatSlot } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";
import { currentYearMonth } from "../rotation.js";

const ADMIN_ID = "286876274037882880";

export default {
  data: new SlashCommandBuilder()
    .setName("pick")
    .setDescription("Set your book pick (Goodreads URL)")
    .addStringOption((opt) =>
      opt
        .setName("url")
        .setDescription("Goodreads URL for the book")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("month")
        .setDescription("Month (admin only — defaults to your assigned month)")
        .addChoices(...MONTH_CHOICES)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("year")
        .setDescription("Year (admin only — defaults to your assigned month)")
        .setMinValue(2025)
        .setMaxValue(2035)
    ),

  async execute(interaction) {
    const url = interaction.options.getString("url", true);
    const monthStr = interaction.options.getString("month");
    const yearOpt = interaction.options.getInteger("year");
    const userId = interaction.user.id;
    const isAdmin = userId === ADMIN_ID;

    // Validate URL looks like a Goodreads link
    if (!url.includes("goodreads.com")) {
      await interaction.reply({
        content: "That doesn't look like a Goodreads URL.",
        ephemeral: true,
      });
      return;
    }

    const schedule = readSchedule();
    const { year: nowYear, month: nowMonth } = currentYearMonth();

    let targetSlot: number;

    if (monthStr && yearOpt) {
      // Explicit month+year — admin only
      if (!isAdmin) {
        await interaction.reply({
          content:
            "Only an admin can specify a month and year. Just use `/pick <url>` to set the book for your assigned month.",
          ephemeral: true,
        });
        return;
      }
      const month = parseInt(monthStr, 10);
      targetSlot = schedule.rotation.findIndex(
        (s) => s.year === yearOpt && s.month === month
      );
      if (targetSlot === -1) {
        await interaction.reply({
          content: `No one is assigned to ${formatSlot(yearOpt, month)}.`,
          ephemeral: true,
        });
        return;
      }
    } else if (monthStr || yearOpt) {
      await interaction.reply({
        content:
          "Please provide both month and year, or neither (to use your assigned month).",
        ephemeral: true,
      });
      return;
    } else {
      // Find the caller's current or next future slot
      targetSlot = schedule.rotation.findIndex(
        (s) =>
          s.memberId === userId &&
          (s.year > nowYear || (s.year === nowYear && s.month >= nowMonth))
      );
      if (targetSlot === -1) {
        await interaction.reply({
          content:
            "You don't have an upcoming slot in the rotation. Ask an admin to assign you one.",
          ephemeral: true,
        });
        return;
      }
    }

    schedule.rotation[targetSlot].bookUrl = url;
    writeSchedule(schedule);

    const slot = schedule.rotation[targetSlot];
    const member = schedule.members.find((m) => m.discordId === slot.memberId);
    const label = formatSlot(slot.year, slot.month);

    await interaction.reply({
      content: `📚 Book picked for **${label}** (${member?.name ?? "unknown"}): ${url}`,
    });
  },
} satisfies Command;
