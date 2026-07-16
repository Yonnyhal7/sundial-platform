import { describe, expect, it } from "vitest";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import {
  buildAiPreviewConfig,
  getBrownGoldVerificationConflicts,
  getBrownGoldVerificationRows,
  hasBrownGoldVerificationScheduleSet,
  updateAiImportPreviewDay,
} from "./aiImportPreview";
import type { AiCalendarImportResult } from "./aiImportTypes";

function brownGoldImport(
  overrides: Partial<AiCalendarImportResult> = {}
): AiCalendarImportResult {
  return {
    schemaVersion: 1,
    source: "openai",
    analyzedAt: "2026-07-16",
    schoolYear: {
      label: "2026-2027",
      startDate: "2026-08-12",
      endDate: "2026-08-21",
      operatingWeekdays: [1, 2, 3, 4, 5],
      confidence: "high",
    },
    detectedSchedules: [
      {
        tempId: "sched-all-periods",
        detectedName: "All Periods 1-6",
        normalizedName: "all periods 1 6",
        category: "special",
        confidence: "high",
        needsSetup: true,
      },
      {
        tempId: "sched-brown",
        detectedName: "Brown Day",
        normalizedName: "brown",
        category: "rotation",
        confidence: "high",
        needsSetup: true,
      },
      {
        tempId: "sched-gold",
        detectedName: "Gold Day",
        normalizedName: "gold",
        category: "rotation",
        confidence: "high",
        needsSetup: true,
      },
    ],
    pattern: {
      type: "repeating",
      scheduleTempIds: ["sched-brown", "sched-gold"],
      confidence: "high",
    },
    noSchoolRanges: [],
    specialDays: [
      {
        id: "first-day",
        startDate: "2026-08-12",
        endDate: "2026-08-12",
        label: "First Day",
        type: "All Periods",
        scheduleTempId: "sched-all-periods",
        isInstructional: true,
        confidence: "high",
      },
    ],
    informationalDates: [],
    warnings: [],
    ...overrides,
  };
}

function brownGoldScheduleMap() {
  return new Map([
    ["sched-all-periods", { id: "sched-all-periods", name: "All Periods 1-6" }],
    ["sched-brown", { id: "sched-brown", name: "Brown Day" }],
    ["sched-gold", { id: "sched-gold", name: "Gold Day" }],
  ]);
}

describe("AI import calendar preview", () => {
  it("renders explicit imported assignments before inferred Brown/Gold pattern days", () => {
    const result = generateSchoolYearCalendar(buildAiPreviewConfig(brownGoldImport()));
    const byDate = new Map(result.days.map((day) => [day.date, day.scheduleId]));

    expect(byDate.get("2026-08-12")).toBe("sched-all-periods");
    expect(byDate.get("2026-08-13")).toBe("sched-brown");
    expect(byDate.get("2026-08-14")).toBe("sched-gold");
    expect(byDate.get("2026-08-17")).toBe("sched-brown");
    expect(byDate.get("2026-08-18")).toBe("sched-gold");
    expect(byDate.get("2026-08-19")).toBe("sched-brown");
    expect(byDate.get("2026-08-20")).toBe("sched-gold");
    expect(byDate.get("2026-08-21")).toBe("sched-brown");
  });

  it("detects the Brown/Gold benchmark schedule set and passes when dates match", () => {
    const result = generateSchoolYearCalendar(buildAiPreviewConfig(brownGoldImport()));
    const scheduleMap = brownGoldScheduleMap();

    expect(hasBrownGoldVerificationScheduleSet(scheduleMap)).toBe(true);
    expect(getBrownGoldVerificationRows(result, scheduleMap).every((row) => row.matches)).toBe(
      true
    );
    expect(getBrownGoldVerificationConflicts(result, scheduleMap)).toHaveLength(0);
  });

  it("reports exact conflicting Brown/Gold preview dates", () => {
    const result = generateSchoolYearCalendar(
      buildAiPreviewConfig(
        brownGoldImport({
          specialDays: [],
        })
      )
    );

    expect(getBrownGoldVerificationConflicts(result, brownGoldScheduleMap())).toContainEqual(
      expect.objectContaining({
        date: "2026-08-12",
        expected: "all period",
        actual: "Brown Day",
      })
    );
  });

  it("edits one preview date without mutating the imported source object", () => {
    const original = brownGoldImport({
      schoolYear: {
        ...brownGoldImport().schoolYear,
        startDate: "2026-08-10",
      },
      noSchoolRanges: [{
        id: "orientation",
        startDate: "2026-08-10",
        endDate: "2026-08-11",
        label: "Teacher Orientation",
        confidence: "high",
      }],
    });

    const edited = updateAiImportPreviewDay(original, {
      date: "2026-08-11",
      scheduleTempId: "sched-gold",
      isSchoolDay: true,
      note: "Orientation ends",
    });
    const result = generateSchoolYearCalendar(buildAiPreviewConfig(edited));
    const byDate = new Map(result.days.map((day) => [day.date, day]));

    expect(byDate.get("2026-08-10")?.isSchoolDay).toBe(false);
    expect(byDate.get("2026-08-10")?.labels).toContain("Teacher Orientation");
    expect(byDate.get("2026-08-11")?.isSchoolDay).toBe(true);
    expect(byDate.get("2026-08-11")?.scheduleId).toBe("sched-gold");
    expect(original.noSchoolRanges[0].endDate).toBe("2026-08-11");
  });
});
