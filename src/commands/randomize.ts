import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { MONTH_CHOICES } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";
import { fillRotationGaps } from "../rotation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("randomize")
    .setDescription(
      "Randomize upcoming slots, keeping pinned and book-picked assignments (Admin only)"
    )
    .addStringOption((opt) =>
      opt
        .setName("month")
        .setDescription("Start month (defaults to next month)")
        .addChoices(...MONTH_CHOICES)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("year")
        .setDescription("Start year (defaults to current/next year)")
        .setMinValue(2025)
        .setMaxValue(2035)
    ),

  adminOnly: true,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const schedule = readSchedule();

    const monthStr = interaction.options.getString("month");
    const yearOpt = interaction.options.getInteger("year");

    let startOverride: { year: number; month: number } | undefined;
    if (monthStr && yearOpt) {
      startOverride = { year: yearOpt, month: parseInt(monthStr, 10) };
    } else if (monthStr || yearOpt) {
      await interaction.editReply(
        "Please provide both month and year, or neither (to start from next month)."
      );
      return;
    }

    try {
      schedule.rotation = fillRotationGaps(
        schedule.members,
        schedule.rotation,
        schedule.exclusions,
        startOverride
      );
      writeSchedule(schedule);
      await interaction.editReply(
        "Rotation updated! Use `/schedule` to see the result."
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await interaction.editReply(`Failed to randomize: ${message}`);
    }
  },
} satisfies Command;
