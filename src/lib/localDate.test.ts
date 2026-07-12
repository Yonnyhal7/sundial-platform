import { describe, expect, it } from "vitest";
import {
  addDaysToLocalDateString,
  formatDateInTimeZone,
  formatLocalDate,
  getMonthKey,
} from "@/lib/localDate";

describe("local date helpers", () => {
  it("formats dates using local date parts without UTC conversion", () => {
    expect(formatLocalDate(new Date(2026, 6, 10, 20, 27))).toBe("2026-07-10");
  });

  it("keeps Pacific evening on the same calendar date even when UTC is next day", () => {
    const instant = new Date("2026-07-11T03:27:00.000Z");

    expect(formatDateInTimeZone(instant, "America/Los_Angeles")).toBe("2026-07-10");
  });

  it("changes to the next local date after local midnight", () => {
    const instant = new Date("2026-07-11T07:05:00.000Z");

    expect(formatDateInTimeZone(instant, "America/Los_Angeles")).toBe("2026-07-11");
  });

  it("adds days without routing through UTC ISO strings", () => {
    expect(addDaysToLocalDateString("2026-07-10", 1)).toBe("2026-07-11");
    expect(addDaysToLocalDateString("2026-07-10", -1)).toBe("2026-07-09");
  });

  it("formats local month keys", () => {
    expect(getMonthKey(new Date(2026, 6, 10))).toBe("2026-07");
  });
});
