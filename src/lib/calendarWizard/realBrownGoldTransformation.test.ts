import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildAiPreviewConfig } from "./aiImportPreview";
import type { AiCalendarImportResult } from "./aiImportTypes";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import { mergeVectorCalendarAssignments } from "./mergeVectorCalendarAssignments";
import { canonicalScheduleName } from "./scheduleIdentity";

vi.mock("server-only", () => ({}));

const fixturePath = resolve(
  process.cwd(),
  ".local-benchmarks/ai-calendar/26-27 DOHS Brown Gold Calendar.pdf"
);
const describeWithFixture = existsSync(fixturePath) ? describe : describe.skip;

function baseImportResult(): AiCalendarImportResult {
  return {
    schemaVersion: 1,
    source: "openai",
    analyzedAt: "2026-07-16T00:00:00.000Z",
    schoolYear: {
      label: "2026-2027",
      startDate: "2026-08-10",
      endDate: "2027-05-31",
      operatingWeekdays: [1, 2, 3, 4, 5],
      confidence: "high",
    },
    detectedSchedules: [
      {
        tempId: "brown",
        detectedName: "Brown Day",
        normalizedName: "brown day",
        category: "rotation",
        confidence: "high",
        needsSetup: true,
      },
      {
        tempId: "gold",
        detectedName: "Gold Day",
        normalizedName: "gold day",
        category: "rotation",
        confidence: "high",
        needsSetup: true,
      },
    ],
    pattern: {
      type: "repeating",
      scheduleTempIds: ["brown", "gold"],
      confidence: "high",
    },
    noSchoolRanges: [
      { id: "orientation", startDate: "2026-08-10", endDate: "2026-08-11", label: "Teacher Orientation", type: "Teacher Work Day", confidence: "high" },
      { id: "labor", startDate: "2026-09-07", endDate: "2026-09-07", label: "Labor Day", type: "Holiday", confidence: "high" },
      { id: "veterans", startDate: "2026-11-11", endDate: "2026-11-11", label: "Veterans Day", type: "Holiday", confidence: "high" },
      { id: "thanksgiving", startDate: "2026-11-26", endDate: "2026-11-27", label: "Thanksgiving Holidays", type: "Holiday", confidence: "high" },
      { id: "christmas", startDate: "2026-12-21", endDate: "2027-01-01", label: "Christmas Recess", type: "School Break", confidence: "high" },
      { id: "mlk", startDate: "2027-01-18", endDate: "2027-01-18", label: "MLK Day", type: "Holiday", confidence: "high" },
      { id: "inservice", startDate: "2027-01-22", endDate: "2027-01-22", label: "Non-Student Inservice Day", type: "Inservice Day", confidence: "high" },
      { id: "lincoln", startDate: "2027-02-08", endDate: "2027-02-08", label: "Lincoln's Day", type: "Holiday", confidence: "high" },
      { id: "washington", startDate: "2027-02-15", endDate: "2027-02-15", label: "Washington's Day", type: "Holiday", confidence: "high" },
      { id: "easter", startDate: "2027-03-22", endDate: "2027-03-26", label: "Easter Recess", type: "School Break", confidence: "high" },
      { id: "district", startDate: "2027-03-29", endDate: "2027-03-29", label: "District Closed", type: "District Closed", confidence: "high" },
      { id: "memorial", startDate: "2027-05-31", endDate: "2027-05-31", label: "Memorial Day", type: "Holiday", confidence: "high" },
    ],
    specialDays: [],
    informationalDates: [],
    warnings: [],
  };
}

describeWithFixture("real DOHS Brown/Gold downstream transformation", () => {
  it("keeps all 164 vector assignments authoritative without classifying normal rotation dates as special", async () => {
    const { extractPdfVectorCalendar } = await import("./pdfVectorCalendarExtraction.server");
    const bytes = await readFile(fixturePath);
    const vector = await extractPdfVectorCalendar(
      new File([bytes], "26-27 DOHS Brown Gold Calendar.pdf", { type: "application/pdf" })
    );

    expect(vector.supported).toBe(true);
    expect(vector.confidence).toBeGreaterThanOrEqual(0.95);
    expect(vector.assignments).toHaveLength(164);

    const importResult = baseImportResult();
    importResult.specialDays = vector.assignments
      .filter((assignment) => ["brown", "gold"].includes(canonicalScheduleName(assignment.scheduleName)))
      .map((assignment) => ({
        id: `legacy-special-${assignment.date}`,
        startDate: assignment.date,
        endDate: assignment.date,
        label: assignment.scheduleName,
        scheduleTempId: canonicalScheduleName(assignment.scheduleName),
        isInstructional: true,
        confidence: "high" as const,
        assignmentSource: "ai_inference" as const,
      }));
    expect(importResult.specialDays.length).toBeGreaterThan(150);

    const merged = mergeVectorCalendarAssignments(importResult, vector);
    expect(merged.datedScheduleAssignments).toHaveLength(164);
    expect(
      merged.specialDays.some((day) =>
        ["brown day", "gold day"].includes(canonicalScheduleName(day.label))
      )
    ).toBe(false);
    expect(
      merged.specialDays.some((day) =>
        canonicalScheduleName(day.label).startsWith("all-periods") && day.startDate === "2026-08-12"
      )
    ).toBe(true);

    const preview = generateSchoolYearCalendar(buildAiPreviewConfig(merged));
    const expected = [
      ["2026-08-12", "all-periods-1-6"],
      ["2026-08-13", "brown"],
      ["2026-08-14", "gold"],
      ["2026-08-17", "brown"],
      ["2026-08-18", "gold"],
      ["2026-08-19", "brown"],
      ["2026-08-20", "gold"],
      ["2026-08-21", "brown"],
      ["2026-08-24", "gold"],
      ["2026-08-25", "brown"],
    ] as const;
    const scheduleNameById = new Map(
      merged.detectedSchedules.map((schedule) => [schedule.tempId, schedule.detectedName])
    );
    for (const [date, scheduleKey] of expected) {
      const day = preview.days.find((candidate) => candidate.date === date);
      expect(canonicalScheduleName(scheduleNameById.get(day?.scheduleId || "") || "")).toBe(scheduleKey);
      expect(day?.assignmentSource).toBe("pdf_vector_fill");
    }
    for (const date of ["2026-09-07", "2026-11-11"]) {
      const day = preview.days.find((candidate) => candidate.date === date);
      expect(day).toMatchObject({ isSchoolDay: false, scheduleId: null, assignmentSource: "no_school" });
    }
  });
});
