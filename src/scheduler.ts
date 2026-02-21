import cron from "node-cron";
import { Client, TextChannel } from "discord.js";
import { readSchedule } from "./data.js";
import { getSlotForMonth, currentMonth, nextActiveMonth } from "./rotation.js";
import { MONTH_NAMES } from "./types.js";

export function initScheduler(client: Client): void {
  const reminderHour = process.env.REMINDER_HOUR ?? "10";

  // Fire at the configured hour on the 15th of every month
  cron.schedule(`0 ${reminderHour} 15 * *`, async () => {
    const schedule = readSchedule();

    if (!schedule.reminderChannelId) {
      console.warn(
        "[scheduler] No reminder channel set. Use /setchannel to configure one."
      );
      return;
    }

    const thisMonth = currentMonth();

    // No reminders in December
    if (thisMonth === 12) return;

    let channel: TextChannel;
    try {
      const fetched = await client.channels.fetch(schedule.reminderChannelId);
      if (!fetched || !(fetched instanceof TextChannel)) {
        console.warn("[scheduler] Reminder channel not found or is not a text channel.");
        return;
      }
      channel = fetched;
    } catch (err) {
      console.error("[scheduler] Failed to fetch reminder channel:", err);
      return;
    }

    const nextMonth = nextActiveMonth();
    const currentSlot = getSlotForMonth(schedule.rotation, thisMonth);
    const nextSlot = getSlotForMonth(schedule.rotation, nextMonth);
    const memberMap = new Map(schedule.members.map((m) => [m.discordId, m.name]));

    const lines: string[] = [
      `📅 **Mid-month book club reminder** (${MONTH_NAMES[thisMonth]}):`,
    ];

    if (currentSlot) {
      lines.push(
        `📍 <@${currentSlot.memberId}> — don't forget to pick a **location** for this month's meetup!`
      );
    } else {
      console.warn(`[scheduler] No rotation slot found for month ${thisMonth}`);
    }

    if (nextSlot) {
      const nextName = memberMap.get(nextSlot.memberId) ?? `<@${nextSlot.memberId}>`;
      lines.push(
        `📚 <@${nextSlot.memberId}> — you're up in **${MONTH_NAMES[nextMonth]}**! Start thinking about your book pick, ${nextName}!`
      );
    } else {
      console.warn(`[scheduler] No rotation slot found for month ${nextMonth}`);
    }

    if (lines.length > 1) {
      await channel.send(lines.join("\n"));
    }
  });

  console.log(
    `[scheduler] Reminders scheduled for the 15th of each month at ${reminderHour}:00`
  );
}
