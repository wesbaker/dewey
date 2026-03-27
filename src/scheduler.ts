import cron from "node-cron";
import { Client, TextChannel } from "discord.js";
import { config } from "./config.js";
import { readSchedule } from "./data.js";
import {
  getSlotForYearMonth,
  currentYearMonth,
  getActiveMonthWindow,
  nextActiveYearMonth,
} from "./rotation.js";
import { MONTH_NAMES, formatSlot } from "./types.js";

export function initScheduler(client: Client): void {
  // Fire at the configured hour on the 15th of every month
  cron.schedule(`0 ${config.reminderHour} 15 * *`, async () => {
    const schedule = readSchedule();

    if (!schedule.reminderChannelId) {
      console.warn(
        "[scheduler] No reminder channel set. Use /setchannel to configure one."
      );
      return;
    }

    const { year: thisYear, month: thisMonth } = currentYearMonth();

    // No reminders in December
    if (thisMonth === 12) return;

    let channel: TextChannel;
    try {
      const fetched = await client.channels.fetch(schedule.reminderChannelId);
      if (!fetched || !(fetched instanceof TextChannel)) {
        console.warn(
          "[scheduler] Reminder channel not found or is not a text channel."
        );
        return;
      }
      channel = fetched;
    } catch (err) {
      console.error("[scheduler] Failed to fetch reminder channel:", err);
      return;
    }

    const nextYM = nextActiveYearMonth(thisYear, thisMonth);
    const currentSlot = getSlotForYearMonth(
      schedule.rotation,
      thisYear,
      thisMonth
    );
    const nextSlot = getSlotForYearMonth(
      schedule.rotation,
      nextYM.year,
      nextYM.month
    );

    const lines: string[] = [
      `📅 **Mid-month book club reminder** (${MONTH_NAMES[thisMonth]} ${thisYear}):`,
    ];

    if (currentSlot) {
      lines.push(
        `📍 <@${currentSlot.memberId}> — don't forget to pick a **location** for this month's meetup!`
      );
    } else {
      console.warn(
        `[scheduler] No rotation slot found for ${formatSlot(thisYear, thisMonth)}`
      );
    }

    if (nextSlot) {
      lines.push(
        `📚 <@${nextSlot.memberId}> — you're up in **${formatSlot(nextYM.year, nextYM.month)}**! Start thinking about your book pick!`
      );
    } else {
      console.warn(
        `[scheduler] No rotation slot found for ${formatSlot(nextYM.year, nextYM.month)}`
      );
    }

    const coverageWindow = getActiveMonthWindow(nextYM.year, nextYM.month, 3);
    const missingMonths = coverageWindow.filter(
      (ym) => !getSlotForYearMonth(schedule.rotation, ym.year, ym.month)
    );

    if (missingMonths.length > 0) {
      const missingLabels = missingMonths
        .map((slot) => `**${formatSlot(slot.year, slot.month)}**`)
        .join(", ");
      lines.push(
        `⚠️ <@${config.adminDiscordId}> — no one is assigned to ${missingLabels} yet.`
      );
    }

    if (lines.length > 1) {
      await channel.send(lines.join("\n"));
    }
  });

  console.log(
    `[scheduler] Reminders scheduled for the 15th of each month at ${config.reminderHour}:00`
  );
}
