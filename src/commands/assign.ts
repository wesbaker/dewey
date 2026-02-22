import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { MONTH_CHOICES, formatSlot, compareSlots } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";

export default {
  data: new SlashCommandBuilder()
    .setName("assign")
    .setDescription(
      "Assign a member to a specific month and year (Admin only)"
    )
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The member to assign")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("month")
        .setDescription("The month to assign them to")
        .setRequired(true)
        .addChoices(...MONTH_CHOICES)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("year")
        .setDescription("The year (e.g. 2026)")
        .setRequired(true)
        .setMinValue(2025)
        .setMaxValue(2035)
    ),

  adminOnly: true,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const monthStr = interaction.options.getString("month", true);
    const month = parseInt(monthStr, 10);
    const year = interaction.options.getInteger("year", true);

    const schedule = readSchedule();

    const member = schedule.members.find((m) => m.discordId === user.id);
    if (!member) {
      await interaction.reply({
        content: `${user.username} is not in the member list. Add them to \`data/schedule.json\` first.`,
        ephemeral: true,
      });
      return;
    }

    const label = formatSlot(year, month);

    // Check if someone is already assigned to this slot
    const conflicting = schedule.rotation.find(
      (s) => s.year === year && s.month === month
    );
    if (conflicting) {
      const other = schedule.members.find(
        (m) => m.discordId === conflicting.memberId
      );
      await interaction.reply({
        content: `${other?.name ?? "Someone"} is already assigned to ${label}. Use \`/swap\` or remove them first.`,
        ephemeral: true,
      });
      return;
    }

    schedule.rotation.push({
      year,
      month,
      memberId: user.id,
      pin: false,
    });
    schedule.rotation.sort(compareSlots);
    writeSchedule(schedule);

    await interaction.reply({
      content: `Assigned **${member.name}** to **${label}**.`,
      ephemeral: true,
    });
  },
} satisfies Command;
