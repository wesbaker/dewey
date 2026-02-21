import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";
import { buildRotation } from "../rotation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("randomize")
    .setDescription("Re-randomize the rotation for the year (Admin only)"),

  adminOnly: true,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const schedule = readSchedule();
    const pins = schedule.rotation.filter((s) => s.pin);

    try {
      schedule.rotation = buildRotation(
        schedule.members,
        pins,
        schedule.exclusions
      );
      writeSchedule(schedule);
      await interaction.editReply(
        "Rotation randomized! Use `/schedule` to see the new order."
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await interaction.editReply(`Failed to randomize: ${message}`);
    }
  },
} satisfies Command;
