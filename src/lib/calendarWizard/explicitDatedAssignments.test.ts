import { describe, expect, it } from "vitest";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import type { CalendarWizardConfig } from "./types";

function config(): CalendarWizardConfig {
  return {
    schoolYear: { startDate: "2026-08-12", endDate: "2026-11-12" },
    operatingWeekdays: [1, 2, 3, 4, 5],
    pattern: { type: "repeating", scheduleIds: ["brown", "gold"] },
    noSchoolRanges: [
      { id: "labor", startDate: "2026-09-07", endDate: "2026-09-07", label: "Labor Day" },
      { id: "veterans", startDate: "2026-11-11", endDate: "2026-11-11", label: "Veterans Day" },
    ],
    specialDays: [{
      id: "first", startDate: "2026-08-12", endDate: "2026-08-12",
      label: "All Periods", scheduleId: "all", isInstructional: true,
      rotationBehavior: "pause", assignmentSource: "genuine_special",
    }],
    datedScheduleAssignments: [
      { date: "2026-08-12", scheduleId: "all", source: "pdf_vector_fill", confidence: 1, rotationBehavior: "pause" },
      { date: "2026-08-13", scheduleId: "brown", source: "pdf_vector_fill", confidence: 1 },
      { date: "2026-08-14", scheduleId: "gold", source: "pdf_vector_fill", confidence: 1 },
      { date: "2026-08-17", scheduleId: "brown", source: "pdf_vector_fill", confidence: 1 },
      { date: "2026-09-07", scheduleId: "gold", source: "pdf_vector_fill", confidence: 1 },
      { date: "2026-09-08", scheduleId: "brown", source: "pdf_vector_fill", confidence: 1 },
      { date: "2026-11-11", scheduleId: "gold", source: "pdf_vector_fill", confidence: 1 },
      { date: "2026-11-12", scheduleId: "brown", source: "pdf_vector_fill", confidence: 1 },
    ],
  };
}

describe("explicit dated schedule assignment precedence", () => {
  it("uses PDF vector assignments directly and never lets the pattern overwrite them", () => {
    const result = generateSchoolYearCalendar(config());
    for (const [date, scheduleId] of [
      ["2026-08-12", "all"], ["2026-08-13", "brown"],
      ["2026-08-14", "gold"], ["2026-08-17", "brown"],
    ]) {
      expect(result.days.find((day) => day.date === date)).toMatchObject({
        scheduleId, assignmentSource: "pdf_vector_fill",
      });
    }
  });

  it("makes single-day holidays canonical no-school dates that override vectors and pause rotation", () => {
    const result = generateSchoolYearCalendar(config());
    expect(result.days.find((day) => day.date === "2026-09-07")).toMatchObject({
      isSchoolDay: false, scheduleId: null, assignmentSource: "no_school",
    });
    expect(result.days.find((day) => day.date === "2026-11-11")).toMatchObject({
      isSchoolDay: false, scheduleId: null, assignmentSource: "no_school",
    });
    expect(result.days.find((day) => day.date === "2026-09-08")).toMatchObject({
      scheduleId: "brown", assignmentSource: "pdf_vector_fill",
    });
    expect(result.days.find((day) => day.date === "2026-11-12")).toMatchObject({
      scheduleId: "brown", assignmentSource: "pdf_vector_fill",
    });
  });

  it("gives administrator preview edits precedence over vector assignments", () => {
    const next = config();
    next.specialDays = [...(next.specialDays || []), {
      id: "admin", startDate: "2026-08-13", endDate: "2026-08-13",
      label: "Verified override", scheduleId: "gold", isInstructional: true,
      assignmentSource: "administrator", rotationBehavior: "pause",
    }];
    expect(generateSchoolYearCalendar(next).days.find((day) => day.date === "2026-08-13")).toMatchObject({
      scheduleId: "gold", assignmentSource: "administrator",
    });
  });
});
