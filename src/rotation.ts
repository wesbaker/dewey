import type { Member, RotationSlot, Exclusion } from "./types.js";
import { isActiveMonth, compareSlots } from "./types.js";

const MAX_ATTEMPTS = 1000;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Advance to the next active month (skipping December). */
export function nextActiveYearMonth(
  year: number,
  month: number
): { year: number; month: number } {
  let m = month + 1;
  let y = year;
  if (m > 12) {
    m = 1;
    y++;
  }
  // Skip December
  if (m === 12) {
    m = 1;
    y++;
  }
  return { year: y, month: m };
}

/** Get current year and month. */
export function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Get the next active year+month from now. */
export function nextActiveFromNow(): { year: number; month: number } {
  const { year, month } = currentYearMonth();
  return nextActiveYearMonth(year, month);
}

/**
 * Generate a list of the next N active months (skipping December),
 * starting from a given year+month (inclusive if it's active, otherwise next active).
 */
export function getActiveMonthWindow(
  startYear: number,
  startMonth: number,
  count: number
): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  let y = startYear;
  let m = startMonth;

  // If starting month is December, advance
  if (!isActiveMonth(m)) {
    const next = nextActiveYearMonth(y, m);
    y = next.year;
    m = next.month;
  }

  while (result.length < count) {
    result.push({ year: y, month: m });
    const next = nextActiveYearMonth(y, m);
    y = next.year;
    m = next.month;
  }

  return result;
}

/** Find a rotation slot for a specific year+month. */
export function getSlotForYearMonth(
  rotation: RotationSlot[],
  year: number,
  month: number
): RotationSlot | undefined {
  return rotation.find((s) => s.year === year && s.month === month);
}

/** Find which slot a member is assigned to (first future occurrence). */
export function getMemberSlot(
  rotation: RotationSlot[],
  memberId: string
): RotationSlot | undefined {
  return rotation.find((s) => s.memberId === memberId);
}

/**
 * Fill empty slots in the rotation with randomized member assignments.
 *
 * Algorithm:
 * 1. Determine the window: next N active months starting from the first month
 *    after the current month, where N = number of members.
 * 2. Identify which slots in that window are already filled (pinned or previously assigned).
 * 3. Identify which members are already assigned in that window.
 * 4. Randomize remaining members into remaining slots, respecting exclusions.
 *
 * Only fills gaps — existing assignments are never overwritten.
 */
export function fillRotationGaps(
  members: Member[],
  existingRotation: RotationSlot[],
  exclusions: Exclusion[]
): RotationSlot[] {
  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const startYM = nextActiveYearMonth(nowYear, nowMonth);

  // Window = one slot per member, starting from next month
  const window = getActiveMonthWindow(
    startYM.year,
    startYM.month,
    members.length
  );

  // Find which window slots are already filled
  const filledSlots = new Map<string, RotationSlot>();
  for (const slot of existingRotation) {
    filledSlots.set(`${slot.year}-${slot.month}`, slot);
  }

  const assignedMembers = new Set<string>();
  const openSlots: { year: number; month: number }[] = [];

  for (const ym of window) {
    const key = `${ym.year}-${ym.month}`;
    const existing = filledSlots.get(key);
    if (existing) {
      assignedMembers.add(existing.memberId);
    } else {
      openSlots.push(ym);
    }
  }

  const unassigned = members
    .map((m) => m.discordId)
    .filter((id) => !assignedMembers.has(id));

  // If there are more open slots than unassigned members, only fill what we can
  const slotsToFill = openSlots.slice(0, unassigned.length);

  if (slotsToFill.length === 0) {
    return existingRotation;
  }

  // Build exclusion map: memberId -> Set<month>
  const exclusionMap = new Map<string, Set<number>>();
  for (const exc of exclusions) {
    if (!exclusionMap.has(exc.memberId)) {
      exclusionMap.set(exc.memberId, new Set());
    }
    exclusionMap.get(exc.memberId)!.add(exc.month);
  }

  // Randomized greedy assignment with restarts
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const shuffledMembers = shuffle(unassigned);
    const shuffledSlots = shuffle(slotsToFill);
    const assigned: RotationSlot[] = [];
    let success = true;

    for (const ym of shuffledSlots) {
      const placed = new Set(assigned.map((a) => a.memberId));
      const candidate = shuffledMembers.find(
        (id) =>
          !placed.has(id) && !(exclusionMap.get(id)?.has(ym.month) ?? false)
      );

      if (!candidate) {
        success = false;
        break;
      }

      assigned.push({
        year: ym.year,
        month: ym.month,
        memberId: candidate,
        pin: false,
      });
    }

    if (success) {
      const result = [...existingRotation, ...assigned];
      result.sort(compareSlots);
      return result;
    }
  }

  throw new Error(
    `Could not build a valid rotation after ${MAX_ATTEMPTS} attempts. ` +
      `Your exclusions may be over-constrained. Try removing some exclusions and re-randomizing.`
  );
}
