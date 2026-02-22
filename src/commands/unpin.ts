import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { formatSlot } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unpin")
    .setDescription(
      "Remove a member's pin from their assigned month (Admin only)"
    )
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The member to unpin")
        .setRequired(true)
    ),

  adminOnly: true,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const schedule = readSchedule();

    const slotIndex = schedule.rotation.findIndex(
      (s) => s.memberId === user.id && s.pin
    );

    if (slotIndex === -1) {
      await interaction.reply({
        content: `${user.username} doesn't have a pinned slot.`,
        ephemeral: true,
      });
      return;
    }

    const slot = schedule.rotation[slotIndex];
    schedule.rotation[slotIndex].pin = false;
    writeSchedule(schedule);

    await interaction.reply({
      content: `Unpinned **${user.username}** from **${formatSlot(slot.year, slot.month)}**. They remain in that slot but it won't be preserved if you re-randomize.`,
      ephemeral: true,
    });
  },
} satisfies Command;
