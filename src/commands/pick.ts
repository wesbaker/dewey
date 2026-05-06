import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { MONTH_CHOICES, formatSlot } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";
import { currentYearMonth } from "../rotation.js";
import { config } from "../config.js";
import { scrapeGoodreadsTitle } from "../goodreads.js";
import { buildBookEmbed } from "../book-embed.js";

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
    const isAdmin = userId === config.adminDiscordId;

    // Validate URL looks like a Goodreads link
    if (!url.includes("goodreads.com")) {
      await interaction.reply({
        content: "That doesn't look like a Goodreads URL.",
        ephemeral: true,
      });
      return;
    }

    // Defer since Goodreads scraping may take a moment
    await interaction.deferReply();

    const schedule = readSchedule();
    const { year: nowYear, month: nowMonth } = currentYearMonth();

    let targetSlot: number;

    if (monthStr && yearOpt) {
      // Explicit month+year — admin only
      if (!isAdmin) {
        await interaction.editReply(
          "Only an admin can specify a month and year. Just use `/pick <url>` to set the book for your assigned month."
        );
        return;
      }
      const month = parseInt(monthStr, 10);
      targetSlot = schedule.rotation.findIndex(
        (s) => s.year === yearOpt && s.month === month
      );
      if (targetSlot === -1) {
        await interaction.editReply(
          `No one is assigned to ${formatSlot(yearOpt, month)}.`
        );
        return;
      }
    } else if (monthStr || yearOpt) {
      await interaction.editReply(
        "Please provide both month and year, or neither (to use your assigned month)."
      );
      return;
    } else {
      // Find the caller's current or next future slot
      targetSlot = schedule.rotation.findIndex(
        (s) =>
          s.memberId === userId &&
          (s.year > nowYear || (s.year === nowYear && s.month >= nowMonth))
      );
      if (targetSlot === -1) {
        await interaction.editReply(
          "You don't have an upcoming slot in the rotation. Ask an admin to assign you one."
        );
        return;
      }
    }

    // Scrape the book title from Goodreads
    const bookTitle = await scrapeGoodreadsTitle(url);

    schedule.rotation[targetSlot].bookUrl = url;
    if (bookTitle) {
      schedule.rotation[targetSlot].bookTitle = bookTitle;
    }
    writeSchedule(schedule);

    const slot = schedule.rotation[targetSlot];
    const member = schedule.members.find(
      (m) => m.discordId === slot.memberId
    );
    const label = formatSlot(slot.year, slot.month);
    const embed = buildBookEmbed({
      slot,
      member,
      label,
      embedTitle: `📚 Book Picked: ${label}`,
    });

    await interaction.editReply({ embeds: [embed] });
  },
} satisfies Command;
