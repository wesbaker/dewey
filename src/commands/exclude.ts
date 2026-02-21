import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { MONTH_CHOICES, MONTH_NAMES } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";

export default {
  data: new SlashCommandBuilder()
    .setName("exclude")
    .setDescription(
      "Exclude a member from being assigned a specific month (Admin only)"
    )
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The member to exclude")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("month")
        .setDescription("The month to exclude them from")
        .setRequired(true)
        .addChoices(...MONTH_CHOICES)
    ),

  adminOnly: true,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const monthStr = interaction.options.getString("month", true);
    const month = parseInt(monthStr, 10);

    const schedule = readSchedule();

    const member = schedule.members.find((m) => m.discordId === user.id);
    if (!member) {
      await interaction.reply({
        content: `${user.username} is not in the member list.`,
        ephemeral: true,
      });
      return;
    }

    const alreadyExcluded = schedule.exclusions.some(
      (e) => e.memberId === user.id && e.month === month
    );
    if (alreadyExcluded) {
      await interaction.reply({
        content: `${member.name} is already excluded from ${MONTH_NAMES[month]}.`,
        ephemeral: true,
      });
      return;
    }

    schedule.exclusions.push({ memberId: user.id, month });
    writeSchedule(schedule);

    await interaction.reply({
      content: `Excluded **${member.name}** from **${MONTH_NAMES[month]}**. Run \`/randomize\` to apply.`,
      ephemeral: true,
    });
  },
} satisfies Command;
