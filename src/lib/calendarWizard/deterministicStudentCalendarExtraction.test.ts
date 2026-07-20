import { describe, expect, it } from "vitest";
import { extractDeterministicStudentCalendar } from "./deterministicStudentCalendarExtraction";
import { normalizeAiCalendarExtraction } from "./aiCalendarImportNormalizer";
import { buildAiPreviewConfig } from "./aiImportPreview";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";

const fixtureText = `
KERN HIGH SCHOOL DISTRICT
STUDENT ATTENDANCE CALENDAR 2026-2027
August 12, 2026 Instruction Begins
January 22, 2027 Non-Student Inservice Day
May 27, 2027 Spring Term Ends = 94 Days
180 INSTRUCTIONAL DAYS
`;

describe("deterministic Kern student calendar extraction", () => {
  it("produces the published 180-day calendar without blockers", () => {
    const raw = extractDeterministicStudentCalendar(fixtureText);
    expect(raw).not.toBeNull();
    const normalized = normalizeAiCalendarExtraction(raw!, { source: "openai" });
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    const preview = generateSchoolYearCalendar(buildAiPreviewConfig(normalized.importResult));
    expect(preview.summary.instructionalDayCount).toBe(180);
    expect(normalized.importResult.schoolYear.instructionalStart).toBe("2026-08-12");
    expect(normalized.importResult.schoolYear.instructionalEnd).toBe("2027-05-27");
    expect(normalized.importResult.noSchoolRanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ startDate: "2026-08-10", endDate: "2026-08-11", label: "Teacher Orientation" }),
      expect.objectContaining({ startDate: "2027-01-22", endDate: "2027-01-22", label: "Non-Student Inservice Day" }),
    ]));
    expect(normalized.importResult.warnings.filter((warning) => warning.severity === "blocking")).toEqual([]);
  });

  it("does not activate for similar but unrecognized calendars", () => {
    expect(extractDeterministicStudentCalendar(fixtureText.replace("180 INSTRUCTIONAL DAYS", "179 INSTRUCTIONAL DAYS"))).toBeNull();
  });
});
