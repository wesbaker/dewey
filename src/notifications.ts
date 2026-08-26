import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { withDataStore, withDataStoreTransaction } from "./data.js";
import type { Notification, NotificationAlert, NotificationStatus } from "./types.js";

const LEASE_DURATION_MS = 5 * 60 * 1000;
const BACKOFF_MINUTES = [1, 5, 15, 60] as const;

interface NotificationRow {
  notification_key: string;
  intended_month: string;
  due_at: string;
  status: NotificationStatus;
  attempt_count: number;
  next_attempt_at: string;
  lease_expires_at: string | null;
  claim_token: string | null;
  last_error: string | null;
  discord_message_id: string | null;
}

interface NotificationAlertRow extends NotificationRow {
  error_message: string;
}

function reminderHour(): number {
  const hour = Number.parseInt(process.env.REMINDER_HOUR ?? "10", 10);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 10;
}

function reminderMonth(now: Date): { year: number; month: number } {
  const month = now.getMonth() + 1;
  return month === 12 ? { year: now.getFullYear(), month: 11 } : { year: now.getFullYear(), month };
}

function monthLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function dueAtFor(year: number, month: number): Date {
  return new Date(year, month - 1, 15, reminderHour(), 0, 0, 0);
}

function toNotification(row: NotificationRow): Notification {
  return {
    key: row.notification_key,
    intendedMonth: row.intended_month,
    dueAt: new Date(row.due_at),
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: new Date(row.next_attempt_at),
    ...(row.lease_expires_at === null
      ? {}
      : { leaseExpiresAt: new Date(row.lease_expires_at) }),
    ...(row.claim_token === null ? {} : { claimToken: row.claim_token }),
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
    ...(row.discord_message_id === null ? {} : { messageId: row.discord_message_id }),
  };
}

function getNotification(db: DatabaseSync, key: string): Notification | undefined {
  const row = db
    .prepare(
      `SELECT notification_key, intended_month, due_at, status, attempt_count,
              next_attempt_at, lease_expires_at, claim_token, last_error, discord_message_id
       FROM notifications WHERE notification_key = ?`
    )
    .get(key) as NotificationRow | undefined;
  return row === undefined ? undefined : toNotification(row);
}

function toNotificationAlert(row: NotificationAlertRow): NotificationAlert {
  return {
    notificationKey: row.notification_key,
    intendedMonth: row.intended_month,
    errorMessage: row.error_message,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: new Date(row.next_attempt_at),
    ...(row.lease_expires_at === null
      ? {}
      : { leaseExpiresAt: new Date(row.lease_expires_at) }),
    ...(row.claim_token === null ? {} : { claimToken: row.claim_token }),
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
    ...(row.discord_message_id === null ? {} : { messageId: row.discord_message_id }),
  };
}

function getNotificationAlert(
  db: DatabaseSync,
  notificationKey: string
): NotificationAlert | undefined {
  const row = db
    .prepare(
      `SELECT notification_key, intended_month, error_message, status, attempt_count,
              next_attempt_at, lease_expires_at, claim_token, last_error, discord_message_id
       FROM notification_alerts WHERE notification_key = ?`
    )
    .get(notificationKey) as NotificationAlertRow | undefined;
  return row === undefined ? undefined : toNotificationAlert(row);
}

function nextAttemptAt(now: Date, attemptCount: number): Date {
  const minutes = BACKOFF_MINUTES[Math.min(attemptCount - 1, BACKOFF_MINUTES.length - 1)];
  return new Date(now.getTime() + minutes * 60 * 1000);
}

export function ensureMonthlyReminder(now: Date): Notification {
  const { year, month } = reminderMonth(now);
  const intendedMonth = monthLabel(year, month);
  const key = `mid-month:${intendedMonth}`;
  const dueAt = dueAtFor(year, month);

  return withDataStore((db) => {
    db.prepare(
      `INSERT INTO notifications
        (notification_key, intended_month, due_at, status, attempt_count, next_attempt_at)
       VALUES (?, ?, ?, 'pending', 0, ?)
       ON CONFLICT(notification_key) DO NOTHING`
    ).run(key, intendedMonth, dueAt.toISOString(), dueAt.toISOString());

    const notification = getNotification(db, key);
    if (!notification) {
      throw new Error(`Failed to create notification ${key}`);
    }
    return notification;
  });
}

export function claimDueNotification(now: Date): Notification | undefined {
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS).toISOString();
  const claimToken = randomUUID();

  return withDataStoreTransaction((db) => {
    const row = db
      .prepare(
        `SELECT notification_key FROM notifications
         WHERE (status = 'pending' AND next_attempt_at <= ?)
            OR (status = 'sending' AND lease_expires_at <= ?)
         ORDER BY due_at, notification_key
         LIMIT 1`
      )
      .get(nowIso, nowIso) as { notification_key: string } | undefined;

    if (!row) return undefined;

    db.prepare(
      `UPDATE notifications
       SET status = 'sending', attempt_count = attempt_count + 1,
           lease_expires_at = ?, claim_token = ?
       WHERE notification_key = ?`
    ).run(leaseExpiresAt, claimToken, row.notification_key);

    return getNotification(db, row.notification_key);
  });
}

export function markNotificationSent(
  key: string,
  claimToken: string,
  messageId: string,
  now: Date
): void {
  withDataStoreTransaction((db) => {
    const result = db
      .prepare(
        `UPDATE notifications
         SET status = 'sent', discord_message_id = ?, lease_expires_at = NULL, claim_token = NULL,
             last_error = NULL, next_attempt_at = ?
         WHERE notification_key = ? AND status = 'sending' AND claim_token = ?`
      )
      .run(messageId, now.toISOString(), key, claimToken);

    if (result.changes !== 1) {
      throw new Error(`Cannot mark notification ${key} as sent without its current claim`);
    }
  });
}

export function markNotificationFailed(
  key: string,
  claimToken: string,
  error: string,
  now: Date
): Notification {
  return withDataStoreTransaction((db) => {
    const notification = getNotification(db, key);
    if (
      !notification ||
      notification.status !== "sending" ||
      notification.claimToken !== claimToken
    ) {
      throw new Error(`Cannot mark notification ${key} as failed without its current claim`);
    }

    const retryAt = nextAttemptAt(now, notification.attemptCount);
    db.prepare(
      `UPDATE notifications
       SET status = 'pending', next_attempt_at = ?, lease_expires_at = NULL,
           claim_token = NULL, last_error = ?
       WHERE notification_key = ?`
    ).run(retryAt.toISOString(), error, key);

    if (notification.attemptCount >= 3) {
      db.prepare(
        `INSERT INTO notification_alerts
          (notification_key, intended_month, error_message, status, attempt_count, next_attempt_at)
         VALUES (?, ?, ?, 'pending', 0, ?)
         ON CONFLICT(notification_key) DO NOTHING`
      ).run(key, notification.intendedMonth, error, now.toISOString());
    }

    const failed = getNotification(db, key);
    if (!failed) {
      throw new Error(`Failed to update notification ${key}`);
    }
    return failed;
  });
}

export function claimDueNotificationAlert(now: Date): NotificationAlert | undefined {
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS).toISOString();
  const claimToken = randomUUID();

  return withDataStoreTransaction((db) => {
    const row = db
      .prepare(
        `SELECT notification_key FROM notification_alerts
         WHERE (status = 'pending' AND next_attempt_at <= ?)
            OR (status = 'sending' AND lease_expires_at <= ?)
         ORDER BY next_attempt_at, notification_key
         LIMIT 1`
      )
      .get(nowIso, nowIso) as { notification_key: string } | undefined;

    if (!row) return undefined;

    db.prepare(
      `UPDATE notification_alerts
       SET status = 'sending', attempt_count = attempt_count + 1,
           lease_expires_at = ?, claim_token = ?
       WHERE notification_key = ?`
    ).run(leaseExpiresAt, claimToken, row.notification_key);

    return getNotificationAlert(db, row.notification_key);
  });
}

export function markNotificationAlertSent(
  notificationKey: string,
  claimToken: string,
  messageId: string,
  now: Date
): void {
  withDataStoreTransaction((db) => {
    const result = db
      .prepare(
        `UPDATE notification_alerts
         SET status = 'sent', discord_message_id = ?, lease_expires_at = NULL, claim_token = NULL,
             last_error = NULL, next_attempt_at = ?
         WHERE notification_key = ? AND status = 'sending' AND claim_token = ?`
      )
      .run(messageId, now.toISOString(), notificationKey, claimToken);

    if (result.changes !== 1) {
      throw new Error(
        `Cannot mark notification alert ${notificationKey} as sent without its current claim`
      );
    }
  });
}

export function markNotificationAlertFailed(
  notificationKey: string,
  claimToken: string,
  error: string,
  now: Date
): NotificationAlert {
  return withDataStoreTransaction((db) => {
    const alert = getNotificationAlert(db, notificationKey);
    if (!alert || alert.status !== "sending" || alert.claimToken !== claimToken) {
      throw new Error(
        `Cannot mark notification alert ${notificationKey} as failed without its current claim`
      );
    }

    const retryAt = nextAttemptAt(now, alert.attemptCount);
    db.prepare(
      `UPDATE notification_alerts
       SET status = 'pending', next_attempt_at = ?, lease_expires_at = NULL,
           claim_token = NULL, last_error = ?
       WHERE notification_key = ?`
    ).run(retryAt.toISOString(), error, notificationKey);

    const failed = getNotificationAlert(db, notificationKey);
    if (!failed) {
      throw new Error(`Failed to update notification alert ${notificationKey}`);
    }
    return failed;
  });
}
