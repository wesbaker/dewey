import { describe, it, expect } from "vitest";
import {
  activeMonthDistance,
  nextActiveYearMonth,
  getActiveMonthWindow,
} from "./rotation.js";

describe("nextActiveYearMonth", () => {
  it("advances month by one", () => {
    expect(nextActiveYearMonth(2026, 1)).toEqual({ year: 2026, month: 2 });
  });

  it("wraps from November to January of next year (skipping December)", () => {
    expect(nextActiveYearMonth(2026, 11)).toEqual({ year: 2027, month: 1 });
  });

  it("skips December when advancing from November", () => {
    // Nov -> skip Dec -> Jan next year
    const result = nextActiveYearMonth(2026, 11);
    expect(result.month).not.toBe(12);
  });

  it("advances from October to November", () => {
    expect(nextActiveYearMonth(2026, 10)).toEqual({ year: 2026, month: 11 });
  });
});

describe("activeMonthDistance", () => {
  it("returns 0 for same month", () => {
    expect(activeMonthDistance({ year: 2026, month: 3 }, { year: 2026, month: 3 })).toBe(0);
  });

  it("returns 1 for adjacent months", () => {
    expect(activeMonthDistance({ year: 2026, month: 3 }, { year: 2026, month: 4 })).toBe(1);
  });

  it("counts 1 active month between November and January (December skipped)", () => {
    // Nov 2026 to Jan 2027: Dec is skipped, so distance = 1
    expect(activeMonthDistance({ year: 2026, month: 11 }, { year: 2027, month: 1 })).toBe(1);
  });

  it("is symmetric", () => {
    const a = { year: 2026, month: 2 };
    const b = { year: 2026, month: 7 };
    expect(activeMonthDistance(a, b)).toBe(activeMonthDistance(b, a));
  });

  it("counts 11 months per year (no December)", () => {
    // Jan 2026 to Jan 2027 = 11 active months apart
    expect(activeMonthDistance({ year: 2026, month: 1 }, { year: 2027, month: 1 })).toBe(11);
  });
});

describe("getActiveMonthWindow", () => {
  it("returns the requested count of months", () => {
    const window = getActiveMonthWindow(2026, 1, 5);
    expect(window).toHaveLength(5);
  });

  it("starts from the given month if active", () => {
    const window = getActiveMonthWindow(2026, 3, 3);
    expect(window[0]).toEqual({ year: 2026, month: 3 });
  });

  it("skips December and wraps to January", () => {
    const window = getActiveMonthWindow(2026, 11, 3);
    expect(window[0]).toEqual({ year: 2026, month: 11 });
    expect(window[1]).toEqual({ year: 2027, month: 1 });
    expect(window[2]).toEqual({ year: 2027, month: 2 });
  });

  it("never includes December in the window", () => {
    const window = getActiveMonthWindow(2026, 1, 12);
    const months = window.map((w) => w.month);
    expect(months).not.toContain(12);
  });
});
