import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE_COLOR,
  getAiScheduleDefaultColor,
  getGeneratedScheduleColor,
  getScheduleCalendarColor,
  getScheduleColorBorder,
  getScheduleDotStyle,
  isValidHexColor,
  normalizeHexColor,
} from "./scheduleColors";

describe("schedule calendar colors", () => {
  it("normalizes six-digit hex colors", () => {
    expect(normalizeHexColor("d4a017")).toBe("#D4A017");
    expect(normalizeHexColor("#d4a017")).toBe("#D4A017");
    expect(normalizeHexColor("  #2563eb  ")).toBe("#2563EB");
  });

  it("rejects invalid or short hex values", () => {
    expect(normalizeHexColor("#fff")).toBeNull();
    expect(normalizeHexColor("blue")).toBeNull();
    expect(normalizeHexColor("#12345G")).toBeNull();
    expect(isValidHexColor("#123456")).toBe(true);
    expect(isValidHexColor("#12345")).toBe(false);
  });

  it("prioritizes an explicit schedule calendar color", () => {
    expect(
      getScheduleCalendarColor({
        id: "schedule-1",
        name: "Brown Day",
        calendar_color: "#0d9488",
      })
    ).toBe("#0D9488");
  });

  it("falls back to a stable generated schedule color", () => {
    expect(getGeneratedScheduleColor("Brown Day")).toBe(getGeneratedScheduleColor("Brown Day"));
    expect(getScheduleCalendarColor({ id: "schedule-1", name: "Brown Day" })).toBe(
      getScheduleCalendarColor({ id: "schedule-1", name: "Renamed Day" })
    );
  });

  it("provides deterministic AI default colors by detected order", () => {
    expect(getAiScheduleDefaultColor(0)).toBe("#92400E");
    expect(getAiScheduleDefaultColor(1)).toBe("#D4A017");
    expect(getAiScheduleDefaultColor(9)).toBe("#92400E");
  });

  it("returns dot styles with a contrast border", () => {
    expect(getScheduleDotStyle("#D4A017")).toMatchObject({
      backgroundColor: "#D4A017",
    });
    expect(getScheduleColorBorder("#FFFFFF")).not.toBe("#FFFFFF");
    expect(getScheduleDotStyle("not-a-color").backgroundColor).toBe(DEFAULT_SCHEDULE_COLOR);
  });
});
