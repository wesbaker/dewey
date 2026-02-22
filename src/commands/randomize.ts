import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";
import { fillRotationGaps } from "../rotation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("randomize")
    .setDescription(
      "Fill empty upcoming slots with randomized member assignments (Admin only)"
    ),

  adminOnly: true,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const schedule = readSchedule();

    try {
      schedule.rotation = fillRotationGaps(
        schedule.members,
        schedule.rotation,
        schedule.exclusions
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
