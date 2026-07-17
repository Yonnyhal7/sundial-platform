import { describe, expect, it } from "vitest";
import type { AiCalendarImportResult } from "./aiImportTypes";
import {
  assignmentSourcePresentation,
  buildAiReviewReadiness,
  deduplicateClassifiedWarnings,
  getTrueScheduleExceptionDates,
  includedNoSchoolLabels,
} from "./aiReviewPresentation";
import type { GeneratedCalendarDay } from "./types";

function importResult(): AiCalendarImportResult {
  const datedScheduleAssignments = Array.from({ length: 164 }, (_, index) => ({
    id: `assignment-${index}`,
    date: `2026-${String(8 + Math.floor(index / 28)).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
    scheduleTempId: index % 2 ? "brown" : "gold",
    scheduleName: index % 2 ? "Brown Day" : "Gold Day",
    source: "pdf_vector_fill" as const,
    confidence: 1,
  }));
  datedScheduleAssignments.push(
    { id: "all-periods", date: "2026-08-12", scheduleTempId: "all", scheduleName: "All Periods 1-6", source: "pdf_vector_fill", confidence: 1 },
    { id: "finals", date: "2026-12-17", scheduleTempId: "finals", scheduleName: "Finals", source: "pdf_vector_fill", confidence: 1 },
    { id: "rally", date: "2027-02-05", scheduleTempId: "rally", scheduleName: "Rally", source: "pdf_vector_fill", confidence: 1 }
  );
  return {
    schemaVersion: 1,
    source: "openai",
    analyzedAt: "2026-07-17",
    schoolYear: { startDate: "2026-08-10", endDate: "2027-05-31", operatingWeekdays: [1, 2, 3, 4, 5], confidence: "high" },
    detectedSchedules: [
      { tempId: "brown", detectedName: "Brown Day", normalizedName: "brown", category: "rotation", confidence: "high", needsSetup: true },
      { tempId: "gold", detectedName: "Gold Day", normalizedName: "gold", category: "rotation", confidence: "high", needsSetup: true },
      { tempId: "all", detectedName: "All Periods 1-6", normalizedName: "all periods", category: "special", confidence: "high", needsSetup: true },
      { tempId: "finals", detectedName: "Finals", normalizedName: "finals", category: "finals", confidence: "high", needsSetup: true },
      { tempId: "rally", detectedName: "Rally", normalizedName: "rally", category: "special", confidence: "high", needsSetup: true },
    ],
    pattern: { type: "repeating", scheduleTempIds: ["brown", "gold"], confidence: "high" },
    datedScheduleAssignments,
    specialDays: [],
    noSchoolRanges: [],
    informationalDates: [],
    warnings: [],
  };
}

const generatedDay = (overrides: Partial<GeneratedCalendarDay> = {}): GeneratedCalendarDay => ({
  date: "2026-08-12",
  weekday: 3,
  isOperatingDay: true,
  isSchoolDay: true,
  baseScheduleId: "all",
  scheduleId: "all",
  labels: [],
  sources: { noSchoolRangeIds: [], specialDayIds: [], informationalDateIds: [], datedScheduleAssignmentId: "all-periods" },
  warningCodes: [],
  assignmentSource: "pdf_vector_fill",
  ...overrides,
});

describe("AI review presentation", () => {
  it("does not classify 164 normal Brown/Gold assignments as schedule exceptions", () => {
    expect(getTrueScheduleExceptionDates(importResult())).toEqual([
      "2026-08-12",
      "2026-12-17",
      "2027-02-05",
    ]);
  });

  it("shows friendly and internal PDF vector provenance", () => {
    expect(assignmentSourcePresentation("pdf_vector_fill")).toEqual({
      friendly: "Detected from PDF color",
      internal: "pdf_vector_fill",
    });
  });

  it("groups duplicate warnings and contained no-school labels", () => {
    const warning = { code: "overlap", message: "Overlapping labels were merged.", severity: "review" as const, classification: "review" as const, resolved: true };
    expect(deduplicateClassifiedWarnings([warning, warning])).toHaveLength(1);
    expect(includedNoSchoolLabels("2026-12-21", "2027-01-01", [{
      code: "no_school_ranges_merged",
      title: "Christmas Recess merged",
      message: "Nested dates were preserved.",
      dateRange: { startDate: "2026-12-21", endDate: "2027-01-01" },
      labelsPreserved: ["Admission Day", "Christmas Holidays", "New Year's Day"],
    }])).toEqual(["Admission Day", "Christmas Holidays", "New Year's Day"]);
  });

  it("treats missing bell times as a non-blocking readiness warning", () => {
    const items = buildAiReviewReadiness({
      importResult: importResult(),
      previewDays: [generatedDay()],
      firstTwoWeeksVerified: true,
      unresolvedAssignmentCount: 0,
      blockingConflictCount: 0,
      previewMatchesCreationPayload: true,
      schedulesNeedingBellTimes: 2,
      currentInstructionalDayCount: 1,
    });
    expect(items.some((item) => item.status === "fail")).toBe(false);
    expect(items.find((item) => item.label.startsWith("Bell times"))).toMatchObject({ status: "warning" });
  });

  it("uses fail states for unresolved assignments and digest conflicts", () => {
    const items = buildAiReviewReadiness({
      importResult: importResult(),
      previewDays: [generatedDay({ scheduleId: null })],
      firstTwoWeeksVerified: false,
      unresolvedAssignmentCount: 1,
      blockingConflictCount: 1,
      previewMatchesCreationPayload: false,
      schedulesNeedingBellTimes: 0,
      currentInstructionalDayCount: 1,
    });
    expect(items.filter((item) => item.status === "fail").length).toBeGreaterThanOrEqual(4);
  });
});
