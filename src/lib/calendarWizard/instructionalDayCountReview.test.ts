import { describe, expect, it } from "vitest";
import { buildAiPreviewConfig, updateAiImportPreviewDay } from "./aiImportPreview";
import type { AiCalendarImportResult } from "./aiImportTypes";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import {
  acknowledgeInstructionalDayCountReview,
  getInstructionalDayCountReviewState,
  initializeInstructionalDayCountReview,
} from "./instructionalDayCountReview";

function mismatchImport(): AiCalendarImportResult {
  return {
    schemaVersion: 1,
    source: "openai",
    analyzedAt: "2026-07-17T00:00:00.000Z",
    expectedInstructionalDayCount: 3,
    declaredInstructionalDayCount: 3,
    schoolYear: {
      startDate: "2026-08-10",
      endDate: "2026-08-17",
      calendarCoverageStart: "2026-08-10",
      calendarCoverageEnd: "2026-08-17",
      instructionalStart: "2026-08-12",
      instructionalEnd: "2026-08-14",
      operatingWeekdays: [1, 2, 3, 4, 5],
      confidence: "high",
    },
    detectedSchedules: [
      { tempId: "brown", detectedName: "Brown Day", normalizedName: "brown", category: "rotation", confidence: "high", needsSetup: true },
      { tempId: "gold", detectedName: "Gold Day", normalizedName: "gold", category: "rotation", confidence: "high", needsSetup: true },
    ],
    pattern: { type: "repeating", scheduleTempIds: ["brown", "gold"], confidence: "high" },
    noSchoolRanges: [{
      id: "orientation",
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      label: "Teacher Orientation",
      type: "Teacher Work Day",
      confidence: "high",
    }],
    specialDays: [],
    informationalDates: [],
    warnings: [],
  };
}

function initializedImport() {
  const source = mismatchImport();
  return initializeInstructionalDayCountReview(
    source,
    generateSchoolYearCalendar(buildAiPreviewConfig(source))
  );
}

function edit(
  source: AiCalendarImportResult,
  date: string,
  classification: "instructional" | "no_school" | "staff_only" | "neutral_non_operating" | "removed_from_coverage",
  scheduleTempId: string | null = null
) {
  return updateAiImportPreviewDay(source, {
    date,
    classification,
    scheduleTempId,
    note: classification === "staff_only" ? "Teacher Orientation" : "Reviewed date",
    rotationBehavior: "pause",
  });
}

describe("instructional-day count discrepancy review", () => {
  it("preserves declared and initially generated counts and surfaces boundary candidates", () => {
    const result = initializedImport();
    expect(result.declaredInstructionalDayCount).toBe(3);
    expect(result.generatedInstructionalDayCount).toBe(5);
    expect(result.instructionalDayCountReview).toMatchObject({
      reasonCode: "instructional_day_count_mismatch",
      acknowledged: false,
    });
    expect(result.instructionalDayCountReview?.discrepancyDates.map((item) => item.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-17",
    ]);
  });

  it("keeps staff-only dates visible without counting them or advancing rotation", () => {
    const source = initializedImport();
    const before = generateSchoolYearCalendar(buildAiPreviewConfig(source));
    const afterSource = edit(source, "2026-08-11", "staff_only");
    const after = generateSchoolYearCalendar(buildAiPreviewConfig(afterSource));
    expect(after.days.find((day) => day.date === "2026-08-11")).toMatchObject({
      classification: "staff_only",
      isSchoolDay: false,
      scheduleId: null,
    });
    expect(after.summary.instructionalDayCount).toBe(before.summary.instructionalDayCount - 1);
    expect(before.days.find((day) => day.date === "2026-08-12")?.scheduleId).toBe("gold");
    expect(after.days.find((day) => day.date === "2026-08-12")?.scheduleId).toBe("brown");
  });

  it("updates the live count for neutral dates while allowing an administrator to retain instruction", () => {
    const source = initializedImport();
    const neutral = edit(source, "2026-08-17", "neutral_non_operating");
    expect(generateSchoolYearCalendar(buildAiPreviewConfig(neutral)).summary.instructionalDayCount).toBe(4);

    const retained = edit(neutral, "2026-08-11", "instructional", "brown");
    expect(generateSchoolYearCalendar(buildAiPreviewConfig(retained)).summary.instructionalDayCount).toBe(4);
    expect(retained.generatedInstructionalDayCount).toBe(5);
  });

  it("resolves readiness after every date is reviewed even when the final count differs", () => {
    let source = initializedImport();
    expect(getInstructionalDayCountReviewState(source.instructionalDayCountReview, 5).ready).toBe(false);
    source = edit(source, "2026-08-10", "staff_only");
    source = edit(source, "2026-08-11", "staff_only");
    source = edit(source, "2026-08-17", "instructional", "gold");
    const preview = generateSchoolYearCalendar(buildAiPreviewConfig(source));
    expect(preview.summary.instructionalDayCount).toBe(4);
    expect(getInstructionalDayCountReviewState(source.instructionalDayCountReview, 4)).toMatchObject({
      status: "resolved",
      ready: true,
    });
  });

  it("allows a group acknowledgment while candidate dates remain unresolved", () => {
    let source = initializedImport();
    source = acknowledgeInstructionalDayCountReview(source, 5, true, "May remain above the PDF total.");
    expect(getInstructionalDayCountReviewState(source.instructionalDayCountReview, 5)).toMatchObject({
      status: "acknowledged",
      ready: true,
      unresolvedDates: ["2026-08-10", "2026-08-11", "2026-08-17"],
    });
    expect(source.instructionalDayCountReview).toMatchObject({
      declaredInstructionalDayCount: 3,
      generatedInstructionalDayCount: 5,
      finalApprovedInstructionalDayCount: 5,
      reviewNote: "May remain above the PDF total.",
    });
  });

  it("keeps preview classifications in the same config used for creation", () => {
    const source = edit(initializedImport(), "2026-08-11", "staff_only");
    const config = buildAiPreviewConfig(source);
    expect(config.dateClassifications).toContainEqual(expect.objectContaining({
      date: "2026-08-11",
      classification: "staff_only",
    }));
    expect(generateSchoolYearCalendar(config).days.find((day) => day.date === "2026-08-11")?.classification).toBe("staff_only");
  });
});
