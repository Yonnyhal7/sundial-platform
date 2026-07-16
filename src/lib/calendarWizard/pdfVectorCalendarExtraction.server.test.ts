import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { matchVectorCalendarStructure } from "./pdfVectorCalendarExtraction.server";
import { ensureFirstInstructionalAnchor, mergeVectorCalendarAssignments } from "./mergeVectorCalendarAssignments";
import type { AiCalendarImportResult } from "./aiImportTypes";

describe("vector calendar extraction", () => {
  const colors: Record<number, string> = {
    12: "#ff0000", 13: "#a56a32", 14: "#f4c20d", 17: "#a56a32",
    18: "#f4c20d", 19: "#a56a32", 20: "#f4c20d",
  };
  const texts = [
    { text: "August 2026", x: 0, y: 120, width: 70, height: 12, page: 1 },
    { text: "All Periods 1-6", x: 225, y: 102, width: 80, height: 10, page: 1 },
    { text: "Brown Day", x: 225, y: 82, width: 55, height: 10, page: 1 },
    { text: "Gold Day", x: 225, y: 62, width: 50, height: 10, page: 1 },
    ...Array.from({ length: 20 }, (_, index) => ({
      text: String(index + 1), x: (index % 7) * 30 + 2, y: 90 - Math.floor(index / 7) * 30 + 2,
      width: 8, height: 8, page: 1,
    })),
  ];
  const rectangles = [
    ...Array.from({ length: 20 }, (_, index) => ({
      x: (index % 7) * 30, y: 90 - Math.floor(index / 7) * 30,
      width: 28, height: 28, color: colors[index + 1] || "#ffffff", page: 1,
    })),
    { x: 210, y: 100, width: 10, height: 10, color: "#ff0000", page: 1 },
    { x: 210, y: 80, width: 10, height: 10, color: "#a56a32", page: 1 },
    { x: 210, y: 60, width: 10, height: 10, color: "#f4c20d", page: 1 },
  ];

  it("maps colored date cells to legend schedules without treating white as instructional", () => {
    const result = matchVectorCalendarStructure(texts, rectangles);
    expect(result.supported).toBe(true);
    expect(result.assignments.find((item) => item.date === "2026-08-12")?.scheduleName).toBe("All Periods 1-6");
    expect(result.assignments.find((item) => item.date === "2026-08-13")?.scheduleName).toBe("Brown Day");
    expect(result.assignments.find((item) => item.date === "2026-08-14")?.scheduleName).toBe("Gold Day");
    expect(result.assignments.some((item) => item.date === "2026-08-11")).toBe(false);
  });

  it("uses cell rows for two-month rollover when digit text baselines have jitter", () => {
    const rolloverTexts = [
      { text: "August - September 2026", x: 0, y: 130, width: 120, height: 10, page: 1 },
      { text: "Brown Day", x: 225, y: 82, width: 55, height: 10, page: 1 },
      ...[31, 1, 2, 3, 4].map((day, index) => ({
        text: String(day), x: index * 30 + 2, y: 92 + index * 0.7,
        width: 8, height: 8, page: 1,
      })),
    ];
    const rolloverRects = [
      ...[31, 1, 2, 3, 4].map((_, index) => ({
        x: index * 30, y: 90, width: 28, height: 28,
        color: "#a56a32", page: 1,
      })),
      { x: 210, y: 80, width: 10, height: 10, color: "#a56a32", page: 1 },
    ];

    const result = matchVectorCalendarStructure(rolloverTexts, rolloverRects);
    expect(result.assignments.map((assignment) => assignment.date)).toEqual([
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
    ]);
  });

  it("makes the explicit first day pause before the alternating rotation", () => {
    const vector = { ...matchVectorCalendarStructure(texts, rectangles), durationMs: 5 };
    const base: AiCalendarImportResult = {
      schemaVersion: 1, source: "openai", analyzedAt: "2026-07-16",
      schoolYear: { startDate: "2026-08-12", endDate: "2027-06-01", operatingWeekdays: [1, 2, 3, 4, 5], confidence: "high" },
      detectedSchedules: [
        { tempId: "brown", detectedName: "Brown Day", normalizedName: "Brown Day", category: "rotation", confidence: "high", needsSetup: true },
        { tempId: "gold", detectedName: "Gold Day", normalizedName: "Gold Day", category: "rotation", confidence: "high", needsSetup: true },
      ],
      pattern: { type: "repeating", scheduleTempIds: ["brown", "gold"], confidence: "high" },
      noSchoolRanges: [], specialDays: [], informationalDates: [], warnings: [],
    };
    const merged = mergeVectorCalendarAssignments(base, vector);
    expect(merged.firstInstructionalAssignment).toMatchObject({ date: "2026-08-12", scheduleName: "All Periods 1-6", source: "pdf_vector_fill" });
    expect(merged.specialDays.find((day) => day.startDate === "2026-08-12")?.rotationBehavior).toBe("pause");
    expect(merged.specialDays.find((day) => day.startDate === "2026-08-13")?.rotationBehavior).toBe("advance");
    expect(merged.legendMappings).toContainEqual({ normalizedColor: "#ff0000", canonicalScheduleKey: "all-periods-1-6", scheduleId: "pdf-vector-all-periods-1-6" });
  });

  it("deduplicates punctuation variants and rewrites every imported reference", () => {
    const vector = { ...matchVectorCalendarStructure(texts, rectangles), durationMs: 5 };
    const base: AiCalendarImportResult = {
      schemaVersion: 1, source: "openai", analyzedAt: "2026-07-16",
      schoolYear: { startDate: "2026-08-12", endDate: "2027-06-01", operatingWeekdays: [1, 2, 3, 4, 5], confidence: "high" },
      detectedSchedules: [
        { tempId: "ai-all", detectedName: "All-Periods 1–6", normalizedName: "All Periods 1 - 6", category: "special", confidence: "high", needsSetup: true },
        { tempId: "ai-brown", detectedName: "Brown Day", normalizedName: "Brown Day", category: "rotation", confidence: "high", needsSetup: true },
        { tempId: "duplicate-brown", detectedName: " Brown  Day ", normalizedName: "Brown Day", category: "rotation", confidence: "review", needsSetup: true },
        { tempId: "ai-gold", detectedName: "Gold Day", normalizedName: "Gold Day", category: "rotation", confidence: "high", needsSetup: true },
      ],
      pattern: { type: "repeating", scheduleTempIds: ["duplicate-brown", "ai-gold"], confidence: "high" },
      noSchoolRanges: [], specialDays: [{ id: "old", startDate: "2026-08-11", endDate: "2026-08-11", label: "Brown", scheduleTempId: "duplicate-brown", isInstructional: true, confidence: "high" }], informationalDates: [], warnings: [],
    };
    const merged = mergeVectorCalendarAssignments(base, vector);
    expect(merged.detectedSchedules.filter((item) => item.detectedName.toLowerCase().includes("brown"))).toHaveLength(1);
    expect(merged.pattern.scheduleTempIds[0]).toBe("pdf-vector-brown");
    expect(merged.specialDays.find((day) => day.id === "old")?.scheduleTempId).toBe("pdf-vector-brown");
    expect(merged.detectedSchedules.filter((item) => item.detectedName.toLowerCase().includes("all"))).toHaveLength(1);
  });

  it("blocks pattern-only first-day inference", () => {
    const base = {
      schemaVersion: 1, source: "openai", analyzedAt: "2026-07-16",
      schoolYear: { startDate: "2026-08-12", endDate: "2027-06-01", operatingWeekdays: [1, 2, 3, 4, 5], confidence: "high" },
      detectedSchedules: [{ tempId: "a", detectedName: "A Day", normalizedName: "A Day", category: "rotation", confidence: "high", needsSetup: true }],
      pattern: { type: "same", scheduleTempIds: ["a"], confidence: "high" },
      noSchoolRanges: [], specialDays: [], informationalDates: [], warnings: [],
    } satisfies AiCalendarImportResult;
    const anchored = ensureFirstInstructionalAnchor(base);
    expect(anchored.firstInstructionalAssignment?.source).toBe("unresolved");
    expect(anchored.warnings).toContainEqual(expect.objectContaining({ code: "first_instructional_schedule_unresolved", severity: "blocking" }));
  });
});
