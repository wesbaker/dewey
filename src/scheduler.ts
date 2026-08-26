import cron from "node-cron";
import { Client } from "discord.js";
import { config } from "./config.js";
import { notificationTrackingBaselineMonth, readSchedule } from "./data.js";
import {
  claimDueNotificationAlert,
  claimDueNotification,
  markNotificationAlertFailed,
  markNotificationAlertSent,
  ensureMonthlyReminder,
  markNotificationFailed,
  markNotificationSent,
} from "./notifications.js";
import {
  getActiveMonthWindow,
  getSlotForYearMonth,
  nextActiveYearMonth,
} from "./rotation.js";
import { formatSlot } from "./types.js";
import type { Notification, NotificationAlert } from "./types.js";

function activePeriodFor(date: Date): { year: number; month: number } {
  const month = date.getMonth() + 1;
  return month === 12
    ? { year: date.getFullYear(), month: 11 }
    : { year: date.getFullYear(), month };
}

function nextActivePeriod(period: { year: number; month: number }): {
  year: number;
  month: number;
} {
  if (period.month === 11) return { year: period.year + 1, month: 1 };
  return { year: period.year, month: period.month + 1 };
}

function isDue(period: { year: number; month: number }, now: Date): boolean {
  const dueAt = new Date(
    period.year,
    period.month - 1,
    15,
    Number(config.reminderHour),
    0,
    0,
    0
  );
  return dueAt <= now;
}

function monthLabel(period: { year: number; month: number }): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

function periodForMonthLabel(label: string): { year: number; month: number } {
  const [year, month] = label.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid notification tracking baseline month: ${label}`);
  }
  return month === 12 ? { year: year + 1, month: 1 } : { year, month };
}

function materializeDueReminders(now: Date): void {
  const current = activePeriodFor(now);
  let period = periodForMonthLabel(notificationTrackingBaselineMonth());

  while (monthLabel(period) <= monthLabel(current)) {
    if (isDue(period, now)) {
      ensureMonthlyReminder(
        new Date(period.year, period.month - 1, 15, Number(config.reminderHour))
      );
    }
    period = nextActivePeriod(period);
  }
}

function notificationPeriod(notification: Notification): { year: number; month: number } {
  const [year, month] = notification.intendedMonth.split("-").map(Number);
  return { year, month };
}

function formatActualSendDate(now: Date): string {
  return now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function reminderContent(notification: Notification, now: Date): string {
  const schedule = readSchedule();
  const { year, month } = notificationPeriod(notification);
  const next = nextActiveYearMonth(year, month);
  const currentSlot = getSlotForYearMonth(schedule.rotation, year, month);
  const nextSlot = getSlotForYearMonth(schedule.rotation, next.year, next.month);
  const lines = [
    `📅 **Mid-month book club reminder** (${formatSlot(year, month)}; sent ${formatActualSendDate(now)}):`,
  ];

  if (currentSlot) {
    lines.push(
      `📍 <@${currentSlot.memberId}> — don't forget to pick a **location** for this month's meetup!`
    );
  } else {
    console.warn(`[scheduler] No rotation slot found for ${formatSlot(year, month)}`);
  }

  if (nextSlot) {
    lines.push(
      `📚 <@${nextSlot.memberId}> — you're up in **${formatSlot(next.year, next.month)}**! Start thinking about your book pick!`
    );
  } else {
    console.warn(`[scheduler] No rotation slot found for ${formatSlot(next.year, next.month)}`);
  }

  const coverageWindow = getActiveMonthWindow(next.year, next.month, 3);
  const missingMonths = coverageWindow.filter(
    (period) => !getSlotForYearMonth(schedule.rotation, period.year, period.month)
  );
  if (missingMonths.length > 0) {
    const missingLabels = missingMonths
      .map((period) => `**${formatSlot(period.year, period.month)}**`)
      .join(", ");
    lines.push(
      `⚠️ <@${config.adminDiscordId}> — no one is assigned to ${missingLabels} yet.`
    );
  }

  return lines.join("\n");
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function alertContent(alert: NotificationAlert): string {
  const [year, month] = alert.intendedMonth.split("-").map(Number);
  return `⚠️ The ${formatSlot(year, month)} reminder has failed three times and will keep retrying. Last error: ${alert.errorMessage}`;
}

interface ReminderChannel {
  send(content: string): Promise<{ id: string }>;
}

function isReminderChannel(channel: unknown): channel is ReminderChannel {
  return (
    typeof channel === "object" &&
    channel !== null &&
    "send" in channel &&
    typeof channel.send === "function"
  );
}

async function fetchReminderChannel(client: Client): Promise<ReminderChannel> {
  const channel = await client.channels.fetch(config.reminderChannelId);
  if (!isReminderChannel(channel)) {
    throw new Error("Reminder channel not found or is not a text channel.");
  }
  return channel;
}

async function deliverDueAdminAlerts(client: Client, now: Date): Promise<void> {
  while (true) {
    const alert = claimDueNotificationAlert(now);
    if (!alert) return;
    if (!alert.claimToken) {
      console.error(`[scheduler] claimed alert ${alert.notificationKey} without a claim token`);
      return;
    }

    try {
      const admin = await client.users.fetch(config.adminDiscordId);
      const message = await admin.send(alertContent(alert));
      markNotificationAlertSent(alert.notificationKey, alert.claimToken, message.id, now);
      console.log(`[scheduler] admin alert ${alert.notificationKey} message-id=${message.id}`);
    } catch (error) {
      const errorMessage = describeError(error);
      console.error(`[scheduler] failed admin alert for ${alert.notificationKey}:`, error);
      try {
        markNotificationAlertFailed(alert.notificationKey, alert.claimToken, errorMessage, now);
      } catch (markError) {
        console.error(
          `[scheduler] failed to record admin alert failure for ${alert.notificationKey}:`,
          markError
        );
      }
    }
  }
}

export async function runDueNotifications(client: Client, now = new Date()): Promise<void> {
  console.log(`[scheduler] worker start ${now.toISOString()}`);
  materializeDueReminders(now);

  while (true) {
    const notification = claimDueNotification(now);
    if (!notification) break;
    if (!notification.claimToken) {
      console.error(`[scheduler] claimed ${notification.key} without a claim token`);
      break;
    }

    console.log(`[scheduler] claim ${notification.key}`);
    try {
      console.log(`[scheduler] send attempt ${notification.key}`);
      const channel = await fetchReminderChannel(client);
      const message = await channel.send(reminderContent(notification, now));
      markNotificationSent(notification.key, notification.claimToken, message.id, now);
      console.log(`[scheduler] send success ${notification.key} message-id=${message.id}`);
    } catch (error) {
      const errorMessage = describeError(error);
      console.error(`[scheduler] failure ${notification.key}:`, error);
      try {
        markNotificationFailed(
          notification.key,
          notification.claimToken,
          errorMessage,
          now
        );
      } catch (markError) {
        console.error(`[scheduler] failed to record failure for ${notification.key}:`, markError);
      }
    }
  }

  await deliverDueAdminAlerts(client, now);
}

function runWorker(client: Client): void {
  void runDueNotifications(client).catch((error) => {
    console.error("[scheduler] worker failed:", error);
  });
}

export function initScheduler(client: Client): void {
  cron.schedule(`0 ${config.reminderHour} 15 * *`, () => runWorker(client));
  setInterval(() => runWorker(client), 5 * 60 * 1000);
  console.log(
    `[scheduler] Reminders scheduled for the 15th of each month at ${config.reminderHour}:00; checking due work every five minutes`
  );
}
