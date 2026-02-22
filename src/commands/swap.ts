import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { formatSlot } from "../types.js";
import { readSchedule, writeSchedule } from "../data.js";

export default {
  data: new SlashCommandBuilder()
    .setName("swap")
    .setDescription("Swap the assigned months of two members (Admin only)")
    .addUserOption((opt) =>
      opt.setName("user1").setDescription("First member").setRequired(true)
    )
    .addUserOption((opt) =>
      opt.setName("user2").setDescription("Second member").setRequired(true)
    ),

  adminOnly: true,

  async execute(interaction) {
    const user1 = interaction.options.getUser("user1", true);
    const user2 = interaction.options.getUser("user2", true);

    if (user1.id === user2.id) {
      await interaction.reply({
        content: "You can't swap a member with themselves.",
        ephemeral: true,
      });
      return;
    }

    const schedule = readSchedule();

    const slot1Index = schedule.rotation.findIndex(
      (s) => s.memberId === user1.id
    );
    const slot2Index = schedule.rotation.findIndex(
      (s) => s.memberId === user2.id
    );

    if (slot1Index === -1) {
      await interaction.reply({
        content: `${user1.username} doesn't have a slot in the rotation.`,
        ephemeral: true,
      });
      return;
    }
    if (slot2Index === -1) {
      await interaction.reply({
        content: `${user2.username} doesn't have a slot in the rotation.`,
        ephemeral: true,
      });
      return;
    }

    const slot1 = schedule.rotation[slot1Index];
    const slot2 = schedule.rotation[slot2Index];

    // Swap member IDs; clear pins since they're now in each other's slots
    schedule.rotation[slot1Index] = {
      year: slot1.year,
      month: slot1.month,
      memberId: user2.id,
      pin: false,
    };
    schedule.rotation[slot2Index] = {
      year: slot2.year,
      month: slot2.month,
      memberId: user1.id,
      pin: false,
    };

    writeSchedule(schedule);

    const member1 = schedule.members.find((m) => m.discordId === user1.id);
    const member2 = schedule.members.find((m) => m.discordId === user2.id);

    await interaction.reply({
      content:
        `Swapped **${member1?.name ?? user1.username}** (now ${formatSlot(slot2.year, slot2.month)}) ` +
        `and **${member2?.name ?? user2.username}** (now ${formatSlot(slot1.year, slot1.month)}). ` +
        `Note: any pins were cleared.`,
      ephemeral: true,
    });
  },
} satisfies Command;
