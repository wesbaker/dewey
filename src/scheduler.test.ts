import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const environment = {
  DEWEY_DATA_DIR: process.env.DEWEY_DATA_DIR,
  REMINDER_HOUR: process.env.REMINDER_HOUR,
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  APPLICATION_ID: process.env.APPLICATION_ID,
  SERVER_ID: process.env.SERVER_ID,
  ADMIN_DISCORD_ID: process.env.ADMIN_DISCORD_ID,
  REMINDER_CHANNEL_ID: process.env.REMINDER_CHANNEL_ID,
};
const temporaryDirectories: string[] = [];
const notificationTrackingStart = new Date(2026, 7, 25, 10, 0, 0);

function createDataDirectory(): string {
  const dataDirectory = mkdtempSync(join(tmpdir(), "dewey-scheduler-"));
  temporaryDirectories.push(dataDirectory);
  writeFileSync(
    join(dataDirectory, "schedule.json"),
    JSON.stringify({ members: [], rotation: [], exclusions: [] })
  );
  return dataDirectory;
}

async function loadScheduler(
  dataDirectory: string,
  trackingStart = notificationTrackingStart
) {
  vi.useFakeTimers();
  vi.setSystemTime(trackingStart);
  process.env.DEWEY_DATA_DIR = dataDirectory;
  process.env.REMINDER_HOUR = "10";
  process.env.DISCORD_TOKEN = "token";
  process.env.APPLICATION_ID = "application";
  process.env.SERVER_ID = "server";
  process.env.ADMIN_DISCORD_ID = "admin-user";
  process.env.REMINDER_CHANNEL_ID = "reminder-channel";
  vi.resetModules();

  const data = await import("./data.js");
  data.initializeDataStore();
  const scheduler = await import("./scheduler.js");
  return { data, scheduler };
}

function fakeClient(send: (content: string) => Promise<{ id: string }>) {
  const adminSend = vi.fn(async (_content: string) => ({ id: "admin-alert" }));
  const channel = { isTextBased: () => true, send: vi.fn(send) };
  return {
    client: {
      channels: { fetch: vi.fn(async () => channel) },
      users: { fetch: vi.fn(async () => ({ send: adminSend })) },
    },
    channel,
    adminSend,
  };
}

afterEach(() => {
  vi.useRealTimers();

  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("durable reminder scheduler", () => {
  it("sends an overdue reminder with its intended month and actual send date", async () => {
    const dataDirectory = createDataDirectory();
    const { scheduler } = await loadScheduler(dataDirectory);
    const sent: string[] = [];
    const { client } = fakeClient(async (content) => {
      sent.push(content);
      return { id: `message-${sent.length}` };
    });
    const now = new Date(2026, 8, 20, 10, 0, 0);

    await scheduler.runDueNotifications(client as never, now);

    expect(client.channels.fetch).toHaveBeenCalledWith("reminder-channel");

    expect(sent.find((content) => content.includes("August 2026"))).toContain(
      "sent September 20, 2026"
    );
    const database = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      database
        .prepare("SELECT status, discord_message_id FROM notifications WHERE notification_key = ?")
        .get("mid-month:2026-08")
    ).toEqual({ status: "sent", discord_message_id: "message-1" });
    database.close();
  });

  it("retries a rejected send after its backoff", async () => {
    const dataDirectory = createDataDirectory();
    const { scheduler } = await loadScheduler(dataDirectory);
    let rejectAugust = true;
    const { client } = fakeClient(async (content) => {
      if (content.includes("reminder** (August 2026;") && rejectAugust) {
        rejectAugust = false;
        throw new Error("Discord unavailable");
      }
      return { id: "delivered" };
    });

    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 20, 10, 0, 0));
    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 20, 10, 1, 0));

    const database = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      database
        .prepare("SELECT status, attempt_count, discord_message_id FROM notifications WHERE notification_key = ?")
        .get("mid-month:2026-08")
    ).toEqual({ status: "sent", attempt_count: 2, discord_message_id: "delivered" });
    database.close();
  });

  it("alerts the admin after the third rejected send", async () => {
    const { scheduler } = await loadScheduler(createDataDirectory());
    const { client, adminSend } = fakeClient(async () => {
      throw new Error("Discord unavailable");
    });

    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 20, 10, 0, 0));
    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 20, 10, 1, 0));
    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 20, 10, 6, 0));

    expect(adminSend).toHaveBeenCalledWith(
      expect.stringContaining("August 2026")
    );
  });

  it("starts tracking at migration rather than replaying the prior month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(notificationTrackingStart);
    const dataDirectory = createDataDirectory();
    const { scheduler } = await loadScheduler(dataDirectory);
    const sent: string[] = [];
    const { client } = fakeClient(async (content) => {
      sent.push(content);
      return { id: `message-${sent.length}` };
    });

    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 25, 10, 0, 0));

    expect(sent.some((content) => content.includes("reminder** (August 2026;"))).toBe(true);
    expect(sent.some((content) => content.includes("reminder** (July 2026;"))).toBe(false);
    const database = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      database.prepare("SELECT value FROM settings WHERE key = ?").get(
        "notification_tracking_baseline_month"
      )
    ).toEqual({ value: "2026-08" });
    database.close();
  });

  it("backfills August after tracking starts there and recovery happens in September", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(notificationTrackingStart);
    const { scheduler } = await loadScheduler(createDataDirectory());
    const sent: string[] = [];
    const { client } = fakeClient(async (content) => {
      sent.push(content);
      return { id: `message-${sent.length}` };
    });

    await scheduler.runDueNotifications(client as never, new Date(2026, 8, 20, 10, 0, 0));

    expect(sent.some((content) => content.includes("reminder** (August 2026;"))).toBe(true);
    expect(sent.some((content) => content.includes("reminder** (September 2026;"))).toBe(true);
    expect(sent.some((content) => content.includes("reminder** (July 2026;"))).toBe(false);
  });

  it("backfills every active due month from the tracking baseline", async () => {
    const dataDirectory = createDataDirectory();
    const { scheduler } = await loadScheduler(dataDirectory);
    const sent: string[] = [];
    const { client } = fakeClient(async (content) => {
      sent.push(content);
      return { id: `message-${sent.length}` };
    });

    await scheduler.runDueNotifications(client as never, new Date(2027, 0, 20, 10, 0, 0));

    for (const month of ["August", "September", "October", "November", "January"]) {
      expect(sent.some((content) => content.includes(`reminder** (${month}`))).toBe(true);
    }
    expect(sent).toHaveLength(5);
  });

  it("records an unavailable configured channel as a retryable reminder failure", async () => {
    const dataDirectory = createDataDirectory();
    const { scheduler } = await loadScheduler(dataDirectory);
    const { client } = fakeClient(async () => ({ id: "unused" }));
    client.channels.fetch.mockRejectedValueOnce(new Error("Unknown Channel"));

    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 20, 10, 0, 0));

    const database = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      database
        .prepare(
          "SELECT status, attempt_count, last_error, next_attempt_at FROM notifications WHERE notification_key = ?"
        )
        .get("mid-month:2026-08")
    ).toEqual({
      status: "pending",
      attempt_count: 1,
      last_error: "Unknown Channel",
      next_attempt_at: new Date(2026, 7, 20, 10, 1, 0).toISOString(),
    });
    database.close();
  });

  it("retries a durable third-failure alert after its first DM attempt fails", async () => {
    const dataDirectory = createDataDirectory();
    const { scheduler } = await loadScheduler(dataDirectory);
    const { client, adminSend } = fakeClient(async () => {
      throw new Error("Discord unavailable");
    });
    adminSend.mockRejectedValueOnce(new Error("DM blocked"));

    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 20, 10, 0, 0));
    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 20, 10, 1, 0));
    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 20, 10, 6, 0));
    await scheduler.runDueNotifications(client as never, new Date(2026, 7, 20, 10, 7, 0));

    expect(adminSend).toHaveBeenCalledTimes(2);
    const database = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      database
        .prepare(
          "SELECT status, attempt_count, discord_message_id FROM notification_alerts WHERE notification_key = ?"
        )
        .get("mid-month:2026-08")
    ).toEqual({ status: "sent", attempt_count: 2, discord_message_id: "admin-alert" });
    database.close();
  });

  it("starts December tracking in January without replaying November", async () => {
    const dataDirectory = createDataDirectory();
    const december = new Date(2026, 11, 20, 10, 0, 0);
    const { scheduler } = await loadScheduler(dataDirectory, december);
    const sent: string[] = [];
    const { client } = fakeClient(async (content) => {
      sent.push(content);
      return { id: "message" };
    });

    await scheduler.runDueNotifications(client as never, december);

    expect(sent).toEqual([]);
    const database = new DatabaseSync(join(dataDirectory, "dewey.sqlite"));
    expect(
      database.prepare("SELECT value FROM settings WHERE key = ?").get(
        "notification_tracking_baseline_month"
      )
    ).toEqual({ value: "2027-01" });
    database.close();
  });

  it("uses December in the actual send date for late reminders", async () => {
    const dataDirectory = createDataDirectory();
    const { scheduler } = await loadScheduler(dataDirectory);
    const sent: string[] = [];
    const { client } = fakeClient(async (content) => {
      sent.push(content);
      return { id: `message-${sent.length}` };
    });

    await scheduler.runDueNotifications(client as never, new Date(2026, 11, 20, 10, 0, 0));

    expect(sent.find((content) => content.includes("August 2026"))).toContain(
      "sent December 20, 2026"
    );
  });
});
