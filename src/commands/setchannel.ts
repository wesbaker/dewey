import { ChannelType, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setchannel")
    .setDescription("Set the channel for mid-month reminders (Admin only)")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("The text channel to post reminders in")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  adminOnly: true,

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel", true);
    const schedule = readSchedule();

    schedule.reminderChannelId = channel.id;
    writeSchedule(schedule);

    await interaction.reply({
      content: `Reminder channel set to <#${channel.id}>. Mid-month reminders will be posted there on the 15th.`,
      ephemeral: true,
    });
  },
} satisfies Command;
