import type {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  ChatInputCommandInteraction,
} from "discord.js";

export interface Member {
  discordId: string;
  name: string;
}

export interface RotationSlot {
  year: number;
  month: number; // 1–11 (December is always skipped)
  memberId: string;
  pin: boolean; // true = manually pinned, preserved across /randomize
  bookUrl?: string; // Goodreads URL for the picked book
  bookTitle?: string; // scraped from Goodreads
}

export interface Exclusion {
  memberId: string;
  month: number; // 1–11 (applies to that calendar month every year)
}

export interface Schedule {
  reminderChannelId: string | null;
  members: Member[];
  rotation: RotationSlot[];
  exclusions: Exclusion[];
}

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  adminOnly?: boolean;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export const MONTH_NAMES: Record<number, string> = {
  1: "January",
  2: "February",
  3: "March",
  4: "April",
  5: "May",
  6: "June",
  7: "July",
  8: "August",
  9: "September",
  10: "October",
  11: "November",
};

/** Month choices for slash commands (January–November). */
export const MONTH_CHOICES = Object.entries(MONTH_NAMES).map(([k, v]) => ({
  name: v,
  value: k,
}));

/** Returns true if a month is active (not December). */
export function isActiveMonth(month: number): boolean {
  return month >= 1 && month <= 11;
}

/** Format a slot's year+month for display, e.g. "March 2026". */
export function formatSlot(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

/**
 * Compare two year+month pairs for sorting.
 * Returns negative if a is before b, positive if after, 0 if equal.
 */
export function compareSlots(
  a: { year: number; month: number },
  b: { year: number; month: number }
): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}
