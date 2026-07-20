import { describe, expect, it } from "vitest";
import {
  getAdjacentCalendarMonthKey,
  getCalendarSwipeMonthOffset,
  normalizeCalendarMonthKey,
} from "./calendarMonthNavigation";

describe("mobile calendar month navigation", () => {
  it("moves across month and year boundaries", () => {
    expect(getAdjacentCalendarMonthKey("2026-12", 1)).toBe("2027-01");
    expect(getAdjacentCalendarMonthKey("2026-01", -1)).toBe("2025-12");
  });

  it("rejects malformed month query values", () => {
    expect(normalizeCalendarMonthKey("2026-13")).toBeNull();
    expect(normalizeCalendarMonthKey("javascript:alert(1)")).toBeNull();
  });

  it("maps horizontal touch gestures to previous and next months", () => {
    expect(
      getCalendarSwipeMonthOffset({ deltaX: -80, deltaY: 8, elapsedMs: 220 })
    ).toBe(1);
    expect(
      getCalendarSwipeMonthOffset({ deltaX: 74, deltaY: 6, elapsedMs: 180 })
    ).toBe(-1);
  });

  it("does not capture vertical scrolling or short accidental drags", () => {
    expect(
      getCalendarSwipeMonthOffset({ deltaX: 30, deltaY: 70, elapsedMs: 160 })
    ).toBe(0);
    expect(
      getCalendarSwipeMonthOffset({ deltaX: 24, deltaY: 3, elapsedMs: 160 })
    ).toBe(0);
  });
});
