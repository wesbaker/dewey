import type { Member, RotationSlot, Exclusion } from "./types.js";
import { ACTIVE_MONTHS } from "./types.js";

const MAX_ATTEMPTS = 1000;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a full 11-month rotation respecting pinned slots and exclusions.
 *
 * Pinned slots are placed first. Remaining members are assigned to remaining
 * months using a randomized greedy algorithm with full restarts (Las Vegas).
 */
export function buildRotation(
  members: Member[],
  pinnedSlots: RotationSlot[],
  exclusions: Exclusion[]
): RotationSlot[] {
  const result: RotationSlot[] = [];
  const assignedMonths = new Set<number>();
  const assignedMembers = new Set<string>();

  // Step 1: Place pinned slots
  for (const pin of pinnedSlots) {
    if (!ACTIVE_MONTHS.includes(pin.month as (typeof ACTIVE_MONTHS)[number])) {
      throw new Error(`Month ${pin.month} is not an active month (1–11 only)`);
    }
    result.push({ month: pin.month, memberId: pin.memberId, pin: true });
    assignedMonths.add(pin.month);
    assignedMembers.add(pin.memberId);
  }

  const openMonths = ACTIVE_MONTHS.filter((m) => !assignedMonths.has(m));
  const unassigned = members
    .map((m) => m.discordId)
    .filter((id) => !assignedMembers.has(id));

  if (unassigned.length !== openMonths.length) {
    throw new Error(
      `Cannot build rotation: ${unassigned.length} unassigned members for ${openMonths.length} open months. ` +
        `Make sure the member list has exactly ${ACTIVE_MONTHS.length} people (with ${pinnedSlots.length} pinned).`
    );
  }

  // Step 2: Build exclusion map
  const exclusionMap = new Map<string, Set<number>>();
  for (const exc of exclusions) {
    if (!exclusionMap.has(exc.memberId)) {
      exclusionMap.set(exc.memberId, new Set());
    }
    exclusionMap.get(exc.memberId)!.add(exc.month);
  }

  // Step 3: Randomized greedy assignment with restarts
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const shuffledMembers = shuffle(unassigned);
    const shuffledMonths = shuffle([...openMonths]);
    const assigned: RotationSlot[] = [];
    let success = true;

    for (const month of shuffledMonths) {
      const placed = new Set(assigned.map((a) => a.memberId));
      const candidate = shuffledMembers.find(
        (id) =>
          !placed.has(id) &&
          !(exclusionMap.get(id)?.has(month) ?? false)
      );

      if (!candidate) {
        success = false;
        break;
      }

      assigned.push({ month, memberId: candidate, pin: false });
    }

    if (success) {
      return [...result, ...assigned].sort((a, b) => a.month - b.month);
    }
  }

  throw new Error(
    `Could not build a valid rotation after ${MAX_ATTEMPTS} attempts. ` +
      `Your exclusions may be over-constrained. Try removing some exclusions and re-randomizing.`
  );
}

export function getSlotForMonth(
  rotation: RotationSlot[],
  month: number
): RotationSlot | undefined {
  return rotation.find((s) => s.month === month);
}

export function getMemberSlot(
  rotation: RotationSlot[],
  memberId: string
): RotationSlot | undefined {
  return rotation.find((s) => s.memberId === memberId);
}

export function currentMonth(): number {
  return new Date().getMonth() + 1;
}

/** Returns the next active month, wrapping November back to January (skipping December). */
export function nextActiveMonth(): number {
  const m = currentMonth();
  if (m >= 11) return 1; // November or December → January
  return m + 1;
}
