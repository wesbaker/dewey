import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { MONTH_CHOICES, MONTH_NAMES } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unexclude")
    .setDescription("Remove a month exclusion for a member (Admin only)")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The member to update")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("month")
        .setDescription("The month to remove the exclusion from")
        .setRequired(true)
        .addChoices(...MONTH_CHOICES)
    ),

  adminOnly: true,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const monthStr = interaction.options.getString("month", true);
    const month = parseInt(monthStr, 10);

    const schedule = readSchedule();

    const before = schedule.exclusions.length;
    schedule.exclusions = schedule.exclusions.filter(
      (e) => !(e.memberId === user.id && e.month === month)
    );

    if (schedule.exclusions.length === before) {
      await interaction.reply({
        content: `${user.username} doesn't have an exclusion for ${MONTH_NAMES[month]}.`,
        ephemeral: true,
      });
      return;
    }

    writeSchedule(schedule);

    await interaction.reply({
      content: `Removed exclusion for **${user.username}** from **${MONTH_NAMES[month]}**. Run \`/randomize\` to apply.`,
      ephemeral: true,
    });
  },
} satisfies Command;
