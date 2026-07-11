import { describe, expect, it } from "vitest";
import {
  buildAiCalendarConfig,
  classifyCalendarWarnings,
  collectUnmappedTemporaryScheduleIds,
  getAiCreateCalendarReadiness,
  planAiSchedulePersistence,
} from "./aiQuickSetupPersistence";
import { mapGeneratedCalendarDaysToRows } from "./persistence";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import { matchDetectedSchedules } from "./aiScheduleMatching";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";
import type { AiImportWarning } from "./aiImportTypes";
import type { CalendarGenerationWarning } from "./types";

describe("AI quick setup persistence planning", () => {
  it("reuses matched existing schedules", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, [
      { id: "brown-real", name: "Brown Day" },
      { id: "gold-real", name: "Gold Day" },
      { id: "rally-real", name: "Rally Schedule" },
      { id: "minimum-real", name: "Minimum Day" },
      { id: "finals-real", name: "Finals" },
    ]);

    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [
        { id: "brown-real", name: "Brown Day", active: true },
        { id: "gold-real", name: "Gold Day", active: true },
        { id: "rally-real", name: "Rally Schedule", active: true },
        { id: "minimum-real", name: "Minimum Day", active: true },
        { id: "finals-real", name: "Finals", active: true },
      ],
    });

    expect(plan.conflict).toBeUndefined();
    expect(plan.schedulesToCreate).toHaveLength(0);
    expect(plan.tempToScheduleId["ai-schedule-brown"]).toBe("brown-real");
  });

  it("creates missing schedules as active concepts needing bell times", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []);
    let counter = 0;

    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [],
      createId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    });

    expect(plan.conflict).toBeUndefined();
    expect(plan.schedulesToCreate.length).toBeGreaterThan(0);
    expect(plan.schedulesToCreate[0]).toMatchObject({
      scheduleName: "Brown Day",
      setupStatus: "needs_times",
    });
    expect(plan.schedulesNeedingTimes.map((schedule) => schedule.name)).toContain("Gold Day");
  });

  it("treats Add Times Later needs_times schedules as informational, not blocking", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []).map(
      (resolution) => ({ ...resolution, setupChoice: "add_later" as const })
    );
    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [],
      createId: () => "00000000-0000-4000-8000-000000000123",
    });

    expect(plan.conflict).toBeUndefined();
    expect(plan.schedulesToCreate.length).toBeGreaterThan(0);
    expect(plan.schedulesToCreate.every((schedule) => schedule.setupStatus === "needs_times")).toBe(true);
  });

  it("uses reviewed schedule names for new schedules", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []).map(
      (resolution) =>
        resolution.tempId === "ai-schedule-gold"
          ? { ...resolution, reviewedName: "Gold Block" }
          : resolution
    );

    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [],
      createId: () => "00000000-0000-4000-8000-000000000999",
    });

    expect(plan.schedulesToCreate.map((schedule) => schedule.scheduleName)).toContain(
      "Gold Block"
    );
  });

  it("returns a safe conflict for normalized duplicate reviewed names", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []).map(
      (resolution) =>
        resolution.tempId === "ai-schedule-gold"
          ? { ...resolution, reviewedName: "Brown Day" }
          : resolution
    );

    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [],
    });

    expect(plan.conflict).toContain("same name");
  });

  it("blocks ignored schedules that are still required by instructional dates", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []).map(
      (resolution) =>
        resolution.tempId === "ai-schedule-finals"
          ? { ...resolution, status: "ignored" as const }
          : resolution
    );

    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [],
    });

    expect(plan.conflict).toContain("could not be created or matched");
  });

  it("blocks empty reviewed schedule names", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []).map(
      (resolution) =>
        resolution.tempId === "ai-schedule-finals"
          ? { ...resolution, reviewedName: "   " }
          : resolution
    );

    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [],
    });

    expect(plan.conflict).toContain("Review every detected schedule name");
  });

  it("blocks when a matched schedule belongs to another school or is inactive", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []).map(
      (resolution) =>
        resolution.tempId === "ai-schedule-brown"
          ? { ...resolution, matchedExistingScheduleId: "other-school-schedule" }
          : resolution
    );

    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [],
    });

    expect(plan.conflict).toContain("unavailable");
  });

  it("replaces temp ids before generating and never maps temp ids to calendar rows", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []);
    let counter = 0;
    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [],
      createId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    });
    const config = buildAiCalendarConfig(importResult, plan.tempToScheduleId);

    expect(collectUnmappedTemporaryScheduleIds(config)).toEqual([]);

    const generated = generateSchoolYearCalendar(config);
    const rows = mapGeneratedCalendarDaysToRows(generated.days, "school-1");
    const rowText = JSON.stringify(rows);

    expect(rowText).not.toContain("ai-schedule-");
    expect(rows.some((row) => row.schedule_id === plan.tempToScheduleId["ai-schedule-gold"])).toBe(true);
  });

  it("allows labeled instructional special days without schedule overrides to use the normal schedule", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []);
    let counter = 0;
    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [],
      createId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    });
    const config = buildAiCalendarConfig(importResult, plan.tempToScheduleId);
    const generated = generateSchoolYearCalendar(config);
    const firstDay = generated.days.find((day) => day.date === "2026-08-12");

    expect(firstDay?.scheduleId).toBeTruthy();
    expect(firstDay?.scheduleId).not.toContain("ai-schedule");
    expect(generated.summary.unassignedInstructionalDayCount).toBe(0);
  });

  it("classifies the April 30 source-document year typo as review-only", () => {
    const warnings: AiImportWarning[] = [
      {
        code: "source_document_date_typo",
        severity: "review",
        message:
          "Event line shows April 30, 2026 within the 2026–27 calendar. Context implies the year should be 2027.",
      },
    ];

    const classification = classifyCalendarWarnings(warnings);

    expect(classification.blockingWarnings).toHaveLength(0);
    expect(classification.reviewWarnings).toHaveLength(1);
  });

  it("marks a corrected review warning as resolved", () => {
    const warnings: AiImportWarning[] = [
      {
        code: "source_document_date_typo",
        severity: "review",
        message:
          "Event line shows April 30, 2026 within the 2026–27 calendar. Context implies the year should be 2027.",
      },
    ];

    const classification = classifyCalendarWarnings(warnings, [
      { code: "source_document_date_typo", status: "accepted_suggestion" },
    ]);

    expect(classification.reviewWarnings).toHaveLength(1);
    expect(classification.resolvedReviewWarnings).toHaveLength(1);
    expect(classification.unresolvedReviewWarnings).toHaveLength(0);
  });

  it("classifies missing bell times as informational", () => {
    const warnings: AiImportWarning[] = [
      {
        code: "schedule_needs_times",
        severity: "review",
        message: "Finals needs bell times before students can see periods.",
      },
    ];

    const classification = classifyCalendarWarnings(warnings);

    expect(classification.informationalWarnings).toHaveLength(1);
    expect(classification.blockingWarnings).toHaveLength(0);
  });

  it("classifies unassigned instructional days as blocking", () => {
    const warnings: CalendarGenerationWarning[] = [
      {
        code: "instructional_day_missing_schedule",
        message: "An instructional day is missing a schedule assignment.",
        dates: ["2026-08-12"],
      },
    ];

    const classification = classifyCalendarWarnings(warnings);

    expect(classification.blockingWarnings).toHaveLength(1);
  });

  it("classifies special-day and no-school overlap as blocking", () => {
    const warnings: CalendarGenerationWarning[] = [
      {
        code: "special_day_overlaps_no_school",
        message: "A special school day overlaps a no-school day.",
        dates: ["2026-12-18"],
      },
    ];

    const classification = classifyCalendarWarnings(warnings);

    expect(classification.blockingWarnings).toHaveLength(1);
  });

  it("allows calendar creation when only review warnings remain", () => {
    const readiness = getAiCreateCalendarReadiness({
      warnings: [
        {
          code: "instructional_day_count_mismatch",
          severity: "review",
          message:
            "The PDF lists 180 instructional days, but the imported rules currently produce 181.",
        },
      ],
      scheduleNameErrorCount: 0,
    });

    expect(readiness.canCreateCalendar).toBe(true);
    expect(readiness.needsReviewAcknowledgment).toBe(true);
  });

  it("blocks calendar creation when blocking warnings remain", () => {
    const readiness = getAiCreateCalendarReadiness({
      warnings: [
        {
          code: "school_year_dates_reversed",
          severity: "blocking",
          message: "The first instructional date appears after the last instructional date.",
        },
      ],
      scheduleNameErrorCount: 0,
    });

    expect(readiness.canCreateCalendar).toBe(false);
    expect(readiness.blockingWarnings).toHaveLength(1);
  });

  it("splits warning counts into blocking and review groups", () => {
    const classification = classifyCalendarWarnings([
      {
        code: "special_day_overlaps_no_school",
        message: "A special school day overlaps a no-school day.",
      },
      {
        code: "instructional_day_count_mismatch",
        severity: "review",
        message: "Review the instructional day count.",
      },
      {
        code: "schedule_needs_times",
        severity: "review",
        message: "Finals needs bell times.",
      },
    ]);

    expect(classification.blockingWarnings).toHaveLength(1);
    expect(classification.reviewWarnings).toHaveLength(1);
    expect(classification.informationalWarnings).toHaveLength(1);
  });
});
