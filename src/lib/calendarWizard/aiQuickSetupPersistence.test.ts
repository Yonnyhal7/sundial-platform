import { describe, expect, it } from "vitest";
import {
  buildAiCalendarConfig,
  classifyCalendarWarnings,
  collectReferencedRemovedScheduleIds,
  collectUnmappedTemporaryScheduleIds,
  getAiCreateCalendarReadiness,
  getAiScheduleUsageDetails,
  isNoSchoolLikeDetectedScheduleName,
  planAiSchedulePersistence,
  removeAiDetectedSchedule,
  validateAiCalendarRpcRows,
} from "./aiQuickSetupPersistence";
import { mapGeneratedCalendarDaysToRows } from "./persistence";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import { matchDetectedSchedules } from "./aiScheduleMatching";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";
import type { AiImportWarning } from "./aiImportTypes";
import type { CalendarGenerationWarning } from "./types";

describe("AI quick setup persistence planning", () => {
  const uuidOne = "00000000-0000-4000-8000-000000000001";
  const uuidTwo = "00000000-0000-4000-8000-000000000002";

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

  it("replaces sched-allperiods before generation", () => {
    const importResult = createMockAiCalendarImportResult();
    const withAllPeriods = {
      ...importResult,
      detectedSchedules: [
        ...importResult.detectedSchedules,
        {
          tempId: "sched-allperiods",
          detectedName: "All-Periods",
          normalizedName: "all periods",
          category: "special" as const,
          confidence: "review" as const,
          needsSetup: true,
        },
      ],
      pattern: {
        ...importResult.pattern,
        scheduleTempIds: ["sched-allperiods"],
      },
    };
    const resolutions = matchDetectedSchedules(withAllPeriods.detectedSchedules, []).map(
      (resolution) =>
        resolution.tempId === "sched-allperiods"
          ? { ...resolution, reviewedName: "All-Periods" }
          : resolution
    );
    const plan = planAiSchedulePersistence({
      importResult: withAllPeriods,
      resolutions,
      existingSchedules: [],
      createId: () => uuidOne,
    });
    const config = buildAiCalendarConfig(withAllPeriods, plan.tempToScheduleId);
    const generated = generateSchoolYearCalendar(config);
    const rows = mapGeneratedCalendarDaysToRows(generated.days, "school-1");

    expect(plan.tempToScheduleId["sched-allperiods"]).toBe(uuidOne);
    expect(JSON.stringify(config)).not.toContain("sched-allperiods");
    expect(validateAiCalendarRpcRows(rows).success).toBe(true);
  });

  it("replaces temp ids in special day schedules", () => {
    const importResult = {
      ...createMockAiCalendarImportResult(),
      pattern: {
        type: "same" as const,
        scheduleTempIds: ["ai-schedule-brown"],
        confidence: "high" as const,
      },
      specialDays: [
        {
          id: "special-all-periods",
          startDate: "2026-09-01",
          endDate: "2026-09-01",
          label: "All Periods",
          scheduleTempId: "sched-allperiods",
          isInstructional: true,
          confidence: "review" as const,
        },
      ],
      detectedSchedules: [
        {
          tempId: "ai-schedule-brown",
          detectedName: "Brown Day",
          normalizedName: "brown",
          category: "regular" as const,
          confidence: "high" as const,
          needsSetup: true,
        },
        {
          tempId: "sched-allperiods",
          detectedName: "All-Periods",
          normalizedName: "all periods",
          category: "special" as const,
          confidence: "review" as const,
          needsSetup: true,
        },
      ],
    };
    let index = 0;
    const plan = planAiSchedulePersistence({
      importResult,
      resolutions: matchDetectedSchedules(importResult.detectedSchedules, []),
      existingSchedules: [],
      createId: () => [uuidOne, uuidTwo][index++]!,
    });
    const config = buildAiCalendarConfig(importResult, plan.tempToScheduleId);

    expect(config.specialDays?.[0]?.scheduleId).toBe(uuidTwo);
    expect(JSON.stringify(config)).not.toContain("sched-allperiods");
  });

  it("replaces temp ids in weekday mappings", () => {
    const importResult = {
      ...createMockAiCalendarImportResult(),
      pattern: {
        type: "weekday" as const,
        scheduleTempIds: ["sched-allperiods"],
        confidence: "review" as const,
      },
      detectedSchedules: [
        {
          tempId: "sched-allperiods",
          detectedName: "All-Periods",
          normalizedName: "all periods",
          category: "special" as const,
          confidence: "review" as const,
          needsSetup: true,
        },
      ],
      specialDays: [],
    };
    const plan = planAiSchedulePersistence({
      importResult,
      resolutions: matchDetectedSchedules(importResult.detectedSchedules, []),
      existingSchedules: [],
      createId: () => uuidOne,
    });
    const config = buildAiCalendarConfig(importResult, plan.tempToScheduleId);

    expect(Object.values(config.pattern.type === "weekday" ? config.pattern.schedulesByWeekday : {})).toEqual(
      expect.arrayContaining([uuidOne])
    );
    expect(JSON.stringify(config)).not.toContain("sched-allperiods");
  });

  it("maps matched existing schedules by temp id even when the detected name is edited", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []).map(
      (resolution) =>
        resolution.tempId === "ai-schedule-brown"
          ? {
              ...resolution,
              reviewedName: "Edited Brown",
              matchedExistingScheduleId: uuidOne,
              status: "matched_by_admin" as const,
              needsSetup: false,
            }
          : resolution
    );
    const plan = planAiSchedulePersistence({
      importResult,
      resolutions,
      existingSchedules: [{ id: uuidOne, name: "Brown Day", active: true }],
      createId: () => uuidTwo,
    });

    expect(plan.tempToScheduleId["ai-schedule-brown"]).toBe(uuidOne);
  });

  it("rejects temp ids in final RPC row schedule_id before Postgres", () => {
    const validation = validateAiCalendarRpcRows([
      {
        date: "2026-08-12",
        schedule_id: "sched-allperiods",
        base_schedule_id: uuidOne,
      },
    ]);

    expect(validation.success).toBe(false);
  });

  it("rejects temp ids in final RPC row base_schedule_id before Postgres", () => {
    const validation = validateAiCalendarRpcRows([
      {
        date: "2026-08-12",
        schedule_id: uuidOne,
        base_schedule_id: "ai-schedule-finals",
      },
    ]);

    expect(validation.success).toBe(false);
  });

  it("allows valid UUID and null final RPC row references", () => {
    expect(
      validateAiCalendarRpcRows([
        {
          date: "2026-08-12",
          schedule_id: uuidOne,
          base_schedule_id: uuidTwo,
        },
        {
          date: "2026-08-13",
          schedule_id: null,
          base_schedule_id: null,
        },
      ]).success
    ).toBe(true);
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

  it("removes unused detected schedules without confirmation data", () => {
    const importResult = createMockAiCalendarImportResult();
    const withUnused = {
      ...importResult,
      detectedSchedules: [
        ...importResult.detectedSchedules,
        {
          tempId: "ai-schedule-unused",
          detectedName: "Unused Legend",
          normalizedName: "unused legend",
          category: "unknown" as const,
          confidence: "review" as const,
          needsSetup: true,
        },
      ],
    };

    const removal = removeAiDetectedSchedule({
      importResult: withUnused,
      tempId: "ai-schedule-unused",
      action: { type: "remove_unused" },
      removedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(removal.success).toBe(true);
    if (removal.success) {
      expect(removal.importResult.detectedSchedules.map((schedule) => schedule.tempId)).not.toContain(
        "ai-schedule-unused"
      );
      expect(removal.affectedDayCount).toBe(0);
    }
  });

  it("requires a resolution choice for used detected schedules", () => {
    const importResult = createMockAiCalendarImportResult();
    const removal = removeAiDetectedSchedule({
      importResult,
      tempId: "ai-schedule-brown",
      action: { type: "remove_unused" },
    });

    expect(removal.success).toBe(false);
  });

  it("reassigns all references before removing a detected schedule", () => {
    const importResult = createMockAiCalendarImportResult();
    const removal = removeAiDetectedSchedule({
      importResult,
      tempId: "ai-schedule-brown",
      action: { type: "reassign", replacementScheduleId: "ai-schedule-gold" },
    });

    expect(removal.success).toBe(true);
    if (removal.success) {
      expect(removal.importResult.pattern.scheduleTempIds).not.toContain("ai-schedule-brown");
      expect(removal.importResult.pattern.scheduleTempIds).toContain("ai-schedule-gold");
      expect(removal.importResult.detectedSchedules.map((schedule) => schedule.tempId)).not.toContain(
        "ai-schedule-brown"
      );
    }
  });

  it("marks affected dates as no school when removing a no-school-like schedule", () => {
    const importResult = createMockAiCalendarImportResult();
    const withNoClasses = {
      ...importResult,
      detectedSchedules: [
        ...importResult.detectedSchedules,
        {
          tempId: "ai-schedule-no-classes",
          detectedName: "No classes scheduled",
          normalizedName: "no classes scheduled",
          category: "unknown" as const,
          confidence: "review" as const,
          needsSetup: true,
        },
      ],
      pattern: {
        ...importResult.pattern,
        scheduleTempIds: [
          ...importResult.pattern.scheduleTempIds,
          "ai-schedule-no-classes",
        ],
      },
    };

    const usage = getAiScheduleUsageDetails(withNoClasses, "ai-schedule-no-classes");
    const removal = removeAiDetectedSchedule({
      importResult: withNoClasses,
      tempId: "ai-schedule-no-classes",
      action: { type: "mark_no_school" },
    });

    expect(isNoSchoolLikeDetectedScheduleName("No classes scheduled")).toBe(true);
    expect(usage.calendarDayCount).toBeGreaterThan(0);
    expect(removal.success).toBe(true);
    if (removal.success) {
      expect(removal.importResult.pattern.scheduleTempIds).not.toContain("ai-schedule-no-classes");
      expect(removal.importResult.noSchoolRanges.length).toBeGreaterThan(importResult.noSchoolRanges.length);
    }
  });

  it("blocks deleting the final pattern schedule without a replacement", () => {
    const importResult = {
      ...createMockAiCalendarImportResult(),
      detectedSchedules: [
        {
          tempId: "ai-schedule-only",
          detectedName: "No classes scheduled",
          normalizedName: "no classes scheduled",
          category: "unknown" as const,
          confidence: "review" as const,
          needsSetup: true,
        },
      ],
      pattern: {
        type: "same" as const,
        scheduleTempIds: ["ai-schedule-only"],
        confidence: "review" as const,
      },
      specialDays: [],
    };

    const removal = removeAiDetectedSchedule({
      importResult,
      tempId: "ai-schedule-only",
      action: { type: "mark_no_school" },
    });

    expect(removal.success).toBe(false);
  });

  it("detects removed schedule ids that still leak into references", () => {
    const importResult = createMockAiCalendarImportResult();
    const leaked = collectReferencedRemovedScheduleIds(importResult, [
      {
        tempId: "ai-schedule-brown",
        name: "Brown Day",
        removedAt: "2026-01-01T00:00:00.000Z",
        action: "removed",
      },
    ]);

    expect(leaked).toEqual(["ai-schedule-brown"]);
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

  it("keeps no-school ranges outside the year as review-only", () => {
    const warnings: CalendarGenerationWarning[] = [
      {
        code: "no_school_range_outside_year",
        message: "A no-school range falls outside the selected school year.",
        sourceIds: ["teacher-orientation"],
      },
    ];

    const classification = classifyCalendarWarnings(warnings);

    expect(classification.blockingWarnings).toHaveLength(0);
    expect(classification.reviewWarnings).toHaveLength(1);
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
