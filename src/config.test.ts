import { afterEach, describe, expect, it, vi } from "vitest";

const original = process.env.REMINDER_CHANNEL_ID;

afterEach(() => {
  if (original === undefined) delete process.env.REMINDER_CHANNEL_ID;
  else process.env.REMINDER_CHANNEL_ID = original;
  vi.resetModules();
});

describe("configuration", () => {
  it("requires a reminder channel ID", async () => {
    delete process.env.REMINDER_CHANNEL_ID;
    process.env.DISCORD_TOKEN = "token";
    process.env.APPLICATION_ID = "application";
    process.env.SERVER_ID = "server";
    process.env.ADMIN_DISCORD_ID = "admin";

    await expect(import("./config.js")).rejects.toThrow(
      "Missing required environment variable: REMINDER_CHANNEL_ID"
    );
  });
});
