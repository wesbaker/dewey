function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getReminderHour(): string {
  const raw = process.env.REMINDER_HOUR?.trim() ?? "10";
  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    throw new Error(
      `Invalid REMINDER_HOUR "${raw}". Expected an integer from 0 to 23.`
    );
  }

  return String(parsed);
}

export const config = {
  discordToken: requireEnv("DISCORD_TOKEN"),
  applicationId: requireEnv("APPLICATION_ID"),
  serverId: requireEnv("SERVER_ID"),
  adminDiscordId: requireEnv("ADMIN_DISCORD_ID"),
  reminderChannelId: requireEnv("REMINDER_CHANNEL_ID"),
  reminderHour: getReminderHour(),
};
