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
  month: number; // 1–11 (December is always skipped)
  memberId: string;
  pin: boolean; // true = manually pinned, preserved across /randomize
}

export interface Exclusion {
  memberId: string;
  month: number; // 1–11
}

export interface Schedule {
  reminderChannelId: string | null;
  year: number;
  members: Member[];
  rotation: RotationSlot[];
  exclusions: Exclusion[];
}

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  adminOnly?: boolean;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

// Months 1–11 available for the rotation (December always empty)
export const ACTIVE_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

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

// For use in SlashCommandBuilder .addChoices()
export const MONTH_CHOICES = ACTIVE_MONTHS.map((m) => ({
  name: MONTH_NAMES[m],
  value: String(m),
}));

export function monthNameToNumber(name: string): number | null {
  const entry = Object.entries(MONTH_NAMES).find(
    ([, v]) => v.toLowerCase() === name.toLowerCase()
  );
  return entry ? parseInt(entry[0], 10) : null;
}
