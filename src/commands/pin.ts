import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { MONTH_CHOICES, MONTH_NAMES } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";

export default {
  data: new SlashCommandBuilder()
    .setName("pin")
    .setDescription("Pin a member to a specific month (Admin only)")
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
        content: `${user.username} is not in the member list. Add them to \`data/schedule.json\` first.`,
        ephemeral: true,
      });
      return;
    }

    // Check if another member is already pinned to this month
    const conflicting = schedule.rotation.find(
      (s) => s.month === month && s.pin && s.memberId !== user.id
    );
    if (conflicting) {
      const other = schedule.members.find(
        (m) => m.discordId === conflicting.memberId
      );
      await interaction.reply({
        content: `${other?.name ?? "Someone"} is already pinned to ${MONTH_NAMES[month]}. Use \`/unpin\` to remove their pin first.`,
        ephemeral: true,
      });
      return;
    }

    // Check if this member is excluded from this month
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
    const existingIndex = schedule.rotation.findIndex((s) => s.month === month);
    if (existingIndex >= 0) {
      schedule.rotation[existingIndex] = {
        month,
        memberId: user.id,
        pin: true,
      };
    } else {
      schedule.rotation.push({ month, memberId: user.id, pin: true });
      schedule.rotation.sort((a, b) => a.month - b.month);
    }

    writeSchedule(schedule);

    if (!excluded) {
      await interaction.reply({
        content: `📌 Pinned **${member.name}** to **${MONTH_NAMES[month]}**. Run \`/randomize\` to rebuild the rest of the rotation around this pin.`,
        ephemeral: true,
      });
    }
  },
} satisfies Command;
