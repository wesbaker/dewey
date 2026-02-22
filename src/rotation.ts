import type { Member, RotationSlot, Exclusion } from "./types.js";
import { isActiveMonth, compareSlots } from "./types.js";

const MAX_ATTEMPTS = 1000;
const MIN_SPACING = 3; // minimum active months between picks for the same member

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

/**
 * Count the number of active months between two year+month pairs (exclusive).
 * E.g. distance from Nov 2026 to Jan 2027 is 1 (December is skipped).
 * Returns the absolute distance regardless of order.
 */
export function activeMonthDistance(
  a: { year: number; month: number },
  b: { year: number; month: number }
): number {
  // Convert each to a sequential "active month index" to make distance easy.
  // Each year has 11 active months (1–11). Index = year * 11 + (month - 1).
  const indexA = a.year * 11 + (a.month - 1);
  const indexB = b.year * 11 + (b.month - 1);
  return Math.abs(indexA - indexB);
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
 * 1. Determine the window: next N active months starting from the specified or
 *    next month, where N = number of members.
 * 2. Clear any non-pinned, non-book-picked slots in the window (so re-randomizing
 *    actually reshuffles).
 * 3. Identify which slots are locked (pinned or have a book pick).
 * 4. Randomize remaining members into remaining slots, respecting:
 *    - Calendar month exclusions
 *    - Minimum 3 active-month spacing between any two picks by the same member
 *      (including slots outside the window, like prior/future months)
 */
export function fillRotationGaps(
  members: Member[],
  existingRotation: RotationSlot[],
  exclusions: Exclusion[],
  startOverride?: { year: number; month: number }
): RotationSlot[] {
  let startYM: { year: number; month: number };
  if (startOverride) {
    startYM = isActiveMonth(startOverride.month)
      ? startOverride
      : nextActiveYearMonth(startOverride.year, startOverride.month);
  } else {
    const { year: nowYear, month: nowMonth } = currentYearMonth();
    startYM = nextActiveYearMonth(nowYear, nowMonth);
  }

  // Window = one slot per member, starting from the specified month
  const window = getActiveMonthWindow(
    startYM.year,
    startYM.month,
    members.length
  );
  const windowKeys = new Set(window.map((ym) => `${ym.year}-${ym.month}`));

  // Partition existing rotation into:
  // - lockedSlots: inside the window AND (pinned OR has a book pick) — kept as-is
  // - outsideSlots: outside the window — kept as-is (context for spacing)
  // - cleared: inside the window, not pinned, no book pick — removed for re-randomizing
  const lockedSlots: RotationSlot[] = [];
  const outsideSlots: RotationSlot[] = [];

  for (const slot of existingRotation) {
    const key = `${slot.year}-${slot.month}`;
    if (windowKeys.has(key)) {
      if (slot.pin || slot.bookUrl) {
        lockedSlots.push(slot);
      }
      // else: cleared — dropped for re-randomizing
    } else {
      outsideSlots.push(slot);
    }
  }

  // Members locked into the window (pinned or book-picked)
  const lockedMembers = new Set(lockedSlots.map((s) => s.memberId));

  // Open slots = window slots that don't have a locked entry
  const lockedKeys = new Set(
    lockedSlots.map((s) => `${s.year}-${s.month}`)
  );
  const openSlots = window.filter(
    (ym) => !lockedKeys.has(`${ym.year}-${ym.month}`)
  );

  // Unassigned members = everyone not locked in the window
  const unassigned = members
    .map((m) => m.discordId)
    .filter((id) => !lockedMembers.has(id));

  // If there are more open slots than unassigned members, only fill what we can
  const slotsToFill = openSlots.slice(0, unassigned.length);

  if (slotsToFill.length === 0) {
    const result = [...outsideSlots, ...lockedSlots];
    result.sort(compareSlots);
    return result;
  }

  // Build exclusion map: memberId -> Set<month>
  const exclusionMap = new Map<string, Set<number>>();
  for (const exc of exclusions) {
    if (!exclusionMap.has(exc.memberId)) {
      exclusionMap.set(exc.memberId, new Set());
    }
    exclusionMap.get(exc.memberId)!.add(exc.month);
  }

  // All fixed slots (outside window + locked in window) for spacing checks
  const fixedSlots = [...outsideSlots, ...lockedSlots];

  // Check whether placing a member at a given year+month violates the spacing
  // constraint relative to fixed slots and the current trial assignment.
  function violatesSpacing(
    memberId: string,
    ym: { year: number; month: number },
    trialAssigned: RotationSlot[]
  ): boolean {
    // Check against all existing fixed slots for this member
    for (const slot of fixedSlots) {
      if (slot.memberId === memberId) {
        if (activeMonthDistance(ym, slot) < MIN_SPACING) {
          return true;
        }
      }
    }
    // Check against slots assigned so far in this trial
    for (const slot of trialAssigned) {
      if (slot.memberId === memberId) {
        if (activeMonthDistance(ym, slot) < MIN_SPACING) {
          return true;
        }
      }
    }
    return false;
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
          !placed.has(id) &&
          !(exclusionMap.get(id)?.has(ym.month) ?? false) &&
          !violatesSpacing(id, ym, assigned)
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
      const result = [...outsideSlots, ...lockedSlots, ...assigned];
      result.sort(compareSlots);
      return result;
    }
  }

  throw new Error(
    `Could not build a valid rotation after ${MAX_ATTEMPTS} attempts. ` +
      `Your exclusions or spacing constraints may be over-constrained. ` +
      `Try removing some exclusions and re-randomizing.`
  );
}
