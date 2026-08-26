import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const originalDataDirectory = process.env.DEWEY_DATA_DIR;
const originalReminderHour = process.env.REMINDER_HOUR;
const temporaryDirectories: string[] = [];

function createDataDirectory(): string {
  const dataDirectory = mkdtempSync(join(tmpdir(), "dewey-notifications-"));
  temporaryDirectories.push(dataDirectory);
  writeFileSync(
    join(dataDirectory, "schedule.json"),
    JSON.stringify({ members: [], rotation: [], exclusions: [] })
  );
  return dataDirectory;
}

async function loadNotifications(dataDirectory: string) {
  process.env.DEWEY_DATA_DIR = dataDirectory;
  process.env.REMINDER_HOUR = "10";
  vi.resetModules();
  return import("./notifications.js");
}

afterEach(() => {
  if (originalDataDirectory === undefined) {
    delete process.env.DEWEY_DATA_DIR;
  } else {
    process.env.DEWEY_DATA_DIR = originalDataDirectory;
  }

  if (originalReminderHour === undefined) {
    delete process.env.REMINDER_HOUR;
  } else {
    process.env.REMINDER_HOUR = originalReminderHour;
  }

  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("durable notification queue", () => {
  it("keeps one August reminder for repeated creation", async () => {
    const dataDirectory = createDataDirectory();
    const notifications = await loadNotifications(dataDirectory);
    const august = new Date(2026, 7, 15, 10, 0, 0);

    const first = notifications.ensureMonthlyReminder(august);
    const second = notifications.ensureMonthlyReminder(august);

    expect(first).toMatchObject({
      key: "mid-month:2026-08",
      intendedMonth: "2026-08",
      status: "pending",
    });
    expect(second).toEqual(first);

    const database = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM notifications").get()
    ).toEqual({ count: 1 });
    database.close();
  });

  it("claims a reminder after its 10:00 due time", async () => {
    const notifications = await loadNotifications(createDataDirectory());
    notifications.ensureMonthlyReminder(new Date(2026, 7, 15, 9, 0, 0));

    const claimed = notifications.claimDueNotification(new Date(2026, 7, 15, 10, 1, 0));

    expect(claimed).toMatchObject({
      key: "mid-month:2026-08",
      status: "sending",
      attemptCount: 1,
    });
  });

  it("records a failed send and delays its retry by one minute", async () => {
    const notifications = await loadNotifications(createDataDirectory());
    notifications.ensureMonthlyReminder(new Date(2026, 7, 15, 10, 0, 0));
    const claim = notifications.claimDueNotification(new Date(2026, 7, 15, 10, 1, 0));

    const failed = notifications.markNotificationFailed(
      "mid-month:2026-08",
      claim?.claimToken ?? "",
      "Discord unavailable",
      new Date(2026, 7, 15, 10, 2, 0)
    );

    expect(failed).toMatchObject({
      key: "mid-month:2026-08",
      status: "pending",
      attemptCount: 1,
      lastError: "Discord unavailable",
      nextAttemptAt: new Date(2026, 7, 15, 10, 3, 0),
    });
  });

  it("persists a successful Discord message ID and does not reclaim it", async () => {
    const notifications = await loadNotifications(createDataDirectory());
    notifications.ensureMonthlyReminder(new Date(2026, 7, 15, 10, 0, 0));
    const claim = notifications.claimDueNotification(new Date(2026, 7, 15, 10, 1, 0));
    notifications.markNotificationSent(
      "mid-month:2026-08",
      claim?.claimToken ?? "",
      "discord-message-123",
      new Date(2026, 7, 15, 10, 2, 0)
    );

    expect(notifications.claimDueNotification(new Date(2026, 7, 15, 12, 0, 0))).toBeUndefined();

    const database = new DatabaseSync(join(process.env.DEWEY_DATA_DIR!, "dewey.sqlite"));
    expect(
      database
        .prepare(
          "SELECT status, discord_message_id FROM notifications WHERE notification_key = ?"
        )
        .get("mid-month:2026-08")
    ).toEqual({ status: "sent", discord_message_id: "discord-message-123" });
    database.close();
  });

  it("does not let a stale worker complete a reclaimed notification", async () => {
    const dataDirectory = createDataDirectory();
    const notifications = await loadNotifications(dataDirectory);
    notifications.ensureMonthlyReminder(new Date(2026, 7, 15, 10, 0, 0));
    const firstClaim = notifications.claimDueNotification(new Date(2026, 7, 15, 10, 1, 0));
    const reclaimed = notifications.claimDueNotification(new Date(2026, 7, 15, 10, 6, 0));

    expect(reclaimed).toMatchObject({ status: "sending", attemptCount: 2 });
    expect(reclaimed?.claimToken).not.toBe(firstClaim?.claimToken);
    expect(() =>
      notifications.markNotificationSent(
        "mid-month:2026-08",
        firstClaim?.claimToken ?? "",
        "stale-message",
        new Date(2026, 7, 15, 10, 7, 0)
      )
    ).toThrow("current claim");
    expect(() =>
      notifications.markNotificationFailed(
        "mid-month:2026-08",
        firstClaim?.claimToken ?? "",
        "stale failure",
        new Date(2026, 7, 15, 10, 7, 0)
      )
    ).toThrow("current claim");

    const database = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      database
        .prepare(
          "SELECT status, claim_token, last_error FROM notifications WHERE notification_key = ?"
        )
        .get("mid-month:2026-08")
    ).toEqual({ status: "sending", claim_token: reclaimed?.claimToken, last_error: null });
    database.close();
  });

  it("uses 1, 5, 15, 60 minute then hourly retry backoff", async () => {
    const notifications = await loadNotifications(createDataDirectory());
    notifications.ensureMonthlyReminder(new Date(2026, 7, 15, 10, 0, 0));
    const attempts = [
      [new Date(2026, 7, 15, 10, 0, 0), new Date(2026, 7, 15, 10, 1, 0)],
      [new Date(2026, 7, 15, 10, 1, 0), new Date(2026, 7, 15, 10, 6, 0)],
      [new Date(2026, 7, 15, 10, 6, 0), new Date(2026, 7, 15, 10, 21, 0)],
      [new Date(2026, 7, 15, 10, 21, 0), new Date(2026, 7, 15, 11, 21, 0)],
      [new Date(2026, 7, 15, 11, 21, 0), new Date(2026, 7, 15, 12, 21, 0)],
    ] as const;

    for (const [attemptAt, expectedRetryAt] of attempts) {
      const claim = notifications.claimDueNotification(attemptAt);
      const failed = notifications.markNotificationFailed(
        "mid-month:2026-08",
        claim?.claimToken ?? "",
        "Discord unavailable",
        attemptAt
      );
      expect(failed.nextAttemptAt).toEqual(expectedRetryAt);
    }
  });

  it("enqueues the admin alert atomically with the third reminder failure", async () => {
    const dataDirectory = createDataDirectory();
    const notifications = await loadNotifications(dataDirectory);
    const attempts = [
      new Date(2026, 7, 15, 10, 0, 0),
      new Date(2026, 7, 15, 10, 1, 0),
      new Date(2026, 7, 15, 10, 6, 0),
    ];

    notifications.ensureMonthlyReminder(attempts[0]);
    for (const attemptAt of attempts) {
      const claim = notifications.claimDueNotification(attemptAt);
      notifications.markNotificationFailed(
        "mid-month:2026-08",
        claim?.claimToken ?? "",
        "Discord unavailable",
        attemptAt
      );
    }

    const database = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      database
        .prepare(
          "SELECT intended_month, error_message, status, attempt_count, next_attempt_at FROM notification_alerts WHERE notification_key = ?"
        )
        .get("mid-month:2026-08")
    ).toEqual({
      intended_month: "2026-08",
      error_message: "Discord unavailable",
      status: "pending",
      attempt_count: 0,
      next_attempt_at: attempts[2].toISOString(),
    });
    database.close();
  });
});
