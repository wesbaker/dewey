import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { MONTH_CHOICES, MONTH_NAMES, formatSlot, compareSlots } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";

export default {
  data: new SlashCommandBuilder()
    .setName("pin")
    .setDescription("Pin a member to a specific month and year (Admin only)")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The member to pin")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("month")
        .setDescription("The month to pin them to")
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
        content: `${user.username} is not in the member list. Add them with \`/addmember\` first.`,
        ephemeral: true,
      });
      return;
    }

    const label = formatSlot(year, month);

    // Check if another member is already assigned to this year+month
    const conflicting = schedule.rotation.find(
      (s) =>
        s.year === year &&
        s.month === month &&
        s.memberId !== user.id
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

    // Check if this member is excluded from this calendar month
    const excluded = schedule.exclusions.some(
      (e) => e.memberId === user.id && e.month === month
    );
    if (excluded) {
      await interaction.reply({
        content: `Warning: ${member.name} has an exclusion for ${MONTH_NAMES[month]}. The pin will be set, but consider removing the exclusion with \`/unexclude\`.`,
        ephemeral: true,
      });
    }

    // Upsert the rotation slot as pinned
    const existingIndex = schedule.rotation.findIndex(
      (s) => s.year === year && s.month === month
    );
    if (existingIndex >= 0) {
      schedule.rotation[existingIndex] = {
        year,
        month,
        memberId: user.id,
        pin: true,
      };
    } else {
      schedule.rotation.push({ year, month, memberId: user.id, pin: true });
      schedule.rotation.sort(compareSlots);
    }

    writeSchedule(schedule);

    if (!excluded) {
      await interaction.reply({
        content: `📌 Pinned **${member.name}** to **${label}**. Run \`/randomize\` to fill in the remaining slots.`,
        ephemeral: true,
      });
    }
  },
} satisfies Command;
