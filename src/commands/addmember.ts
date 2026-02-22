import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";

export default {
  data: new SlashCommandBuilder()
    .setName("addmember")
    .setDescription("Add a member to the book club (Admin only)")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The Discord user to add")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("Display name for the schedule (defaults to their Discord username)")
    ),

  adminOnly: true,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const name = interaction.options.getString("name") ?? user.displayName;

    const schedule = readSchedule();

    const existing = schedule.members.find((m) => m.discordId === user.id);
    if (existing) {
      await interaction.reply({
        content: `${existing.name} is already in the book club.`,
        ephemeral: true,
      });
      return;
    }

    schedule.members.push({ discordId: user.id, name });
    writeSchedule(schedule);

    await interaction.reply({
      content: `Added **${name}** (<@${user.id}>) to the book club. There are now ${schedule.members.length} members.`,
      ephemeral: true,
    });
  },
} satisfies Command;
