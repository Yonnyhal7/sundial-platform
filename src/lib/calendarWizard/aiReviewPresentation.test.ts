import { describe, expect, it } from "vitest";
import type { AiCalendarImportResult } from "./aiImportTypes";
import { classifyCalendarWarnings } from "./aiQuickSetupPersistence";
import {
  assignmentSourcePresentation,
  buildAiReviewCardViewModel,
  buildAiReviewReadiness,
  deduplicateClassifiedWarnings,
  getAiReviewIssuePresentation,
  getCalendarWarningDateDetails,
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
  const issue = (issueCode: string, affectedDates: string[] = []) => ({
    issueId: `${issueCode}::test`, issueCode, code: issueCode, affectedDates,
    message: "Internal diagnostic message", severity: "needs_review" as const,
    status: "unresolved" as const, classification: "needs_review" as const,
    resolved: false, relevantLabelIdentities: [], createdBy: "review_issue_normalizer" as const,
    sourceArray: "test", originalSeverity: "review" as const,
    finalSeverity: "needs_review" as const, finalStatus: "unresolved" as const,
    persistedOrGenerated: "normalized" as const,
  });

  it("uses concise issue-specific copy for regular-schedule inference", () => {
    const presentation = getAiReviewIssuePresentation({
      issue: issue("schedule_default_inferred"), importResult: importResult(), currentInstructionalDayCount: 180,
    });
    expect(presentation.title).toBe("No rotating schedule was found");
    expect(presentation.actions.map((action) => action.label)).toEqual(["Use Regular Schedule", "Set Up a Rotation"]);
  });

  it("uses the current classification in low-confidence actions", () => {
    const result = importResult();
    result.dateClassifications = [{ date: "2026-08-12", classification: "instructional", confidence: 0.5 }];
    const presentation = getAiReviewIssuePresentation({
      issue: issue("low_confidence_classification", ["2026-08-12"]), importResult: result, currentInstructionalDayCount: 180,
    });
    expect(presentation.affectedSummary).toBe("Aug 12, 2026");
    expect(presentation.actions.map((action) => action.label)).toEqual(["Mark as School Day", "Review Date"]);
  });

  it("renders named outside-range events with remove, change, and keep actions", () => {
    const result = importResult();
    result.schoolYear = { ...result.schoolYear, startDate: "2026-08-12", endDate: "2027-05-27" };
    result.specialDays = [{ id: "rally", startDate: "2027-06-01", endDate: "2027-06-01", label: "1st Block Rally – Whole School (Stadium)", isInstructional: true, confidence: "high" }];
    const presentation = getAiReviewIssuePresentation({
      issue: issue("special_day_outside_school_year", ["2027-06-01"]), importResult: result, currentInstructionalDayCount: 180,
    });
    expect(presentation.title).toBe("1st Block Rally – Whole School (Stadium) is outside the school year");
    expect(presentation.description).toContain("Aug 12, 2026 through May 27, 2027");
    expect(presentation.actions.map((action) => action.label)).toEqual(["Remove This Event", "Change the Date", "Keep as an Outside Event"]);
  });

  it("renders dynamic count mismatch actions", () => {
    const result = importResult();
    result.instructionalDayCountReview = {
      reasonCode: "instructional_day_count_mismatch", declaredInstructionalDayCount: 180,
      generatedInstructionalDayCount: 186, discrepancyDates: [], acknowledged: false,
    };
    const presentation = getAiReviewIssuePresentation({
      issue: issue("instructional_day_count_mismatch"), importResult: result, currentInstructionalDayCount: 186,
    });
    expect(presentation.description).toContain("Review the 6 dates");
    expect(presentation.actions.map((action) => action.label)).toEqual(["Review the 6 Dates", "Use PDF Count: 180", "Keep Sundial Count: 186"]);
  });

  it("uses safe fallback copy without exposing unknown issue codes", () => {
    const presentation = getAiReviewIssuePresentation({
      issue: issue("internal_future_code"), importResult: importResult(), currentInstructionalDayCount: 180,
    });
    expect(presentation.title).toBe("Review this calendar item");
    expect(presentation.actions.map((action) => action.label)).toEqual(["Review Details", "Dismiss"]);
    expect(JSON.stringify(presentation)).not.toContain("internal_future_code");
  });

  it("canonicalizes persisted and cache-restored legacy warning shapes before presentation", () => {
    const result = importResult();
    result.schoolYear = { ...result.schoolYear, startDate: "2026-08-10", endDate: "2027-05-31" };
    const cases = [
      issue("event_outside_school_year", ["2027-06-01"]),
      issue("special_day_outside_range", ["2027-06-02"]),
      issue("low_confidence_classification", ["2026-08-12"]),
      issue("instructional_day_count_mismatch"),
      { ...issue("ai_import_review"), message: "Legend lists schedule names (Finals, Brown Day, Gold Day, Minimum Day) but the calendar page does not provide explicit date assignments or a repeating schedule mapping for them." },
      { ...issue("ai_import_review"), message: "No rotating schedule was detected." },
    ];
    const cards = cases.map((legacyIssue) => buildAiReviewCardViewModel({
      issue: legacyIssue,
      importResult: result,
      currentInstructionalDayCount: 180,
    }));
    expect(cards.map((card) => card.title)).toEqual([
      "A special day falls outside the school year",
      "A special day falls outside the school year",
      "One date needs confirmation",
      "Instructional-day count does not match",
      "Schedule names were found without assigned dates",
      "No rotating schedule was found",
    ]);
    expect(cards[4].description).toBe("Sundial found Finals, Brown Day, Gold Day, and Minimum Day in the legend, but could not determine which dates use them.");
    expect(cards[4].actions.map((action) => action.label)).toEqual(["Assign Schedule Dates", "Use Regular Schedule", "Review Details"]);
    expect(JSON.stringify(cards)).not.toMatch(/calendarCoverageStart|calendarCoverageEnd/);
    expect(cards.flatMap((card) => card.actions).map((action) => action.label)).not.toContain(["Use", "suggested correction"].join(" "));
  });

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
    const warning = {
      issueId: "overlap::none::none",
      issueCode: "overlap",
      affectedDates: [],
      code: "overlap",
      message: "Overlapping labels were merged.",
      severity: "needs_review" as const,
      status: "acknowledged" as const,
      classification: "needs_review" as const,
      resolved: true,
      relevantLabelIdentities: [],
      createdBy: "review_issue_normalizer" as const,
      sourceArray: "test",
      originalSeverity: "review" as const,
      finalSeverity: "needs_review" as const,
      finalStatus: "acknowledged" as const,
      persistedOrGenerated: "normalized" as const,
    };
    expect(deduplicateClassifiedWarnings([warning, warning])).toHaveLength(1);
    expect(includedNoSchoolLabels("2026-12-21", "2027-01-01", [{
      code: "no_school_ranges_merged",
      title: "Christmas Recess merged",
      message: "Nested dates were preserved.",
      dateRange: { startDate: "2026-12-21", endDate: "2027-01-01" },
      labelsPreserved: ["Admission Day", "Christmas Holidays", "New Year's Day"],
    }])).toEqual(["Admission Day", "Christmas Holidays", "New Year's Day"]);
  });

  it("presents the exact date and labels for a safe no-school overlap", () => {
    const result = importResult();
    result.noSchoolRanges = [{
      id: "christmas-recess",
      startDate: "2026-12-21",
      endDate: "2027-01-01",
      label: "Christmas Recess",
      type: "Recess",
      confidence: "high",
    }];
    result.informationalDates = [{
      id: "admission-day",
      date: "2026-12-23",
      label: "Admission Day",
      confidence: "high",
    }];
    const warning = classifyCalendarWarnings([{
      code: "special_day_overlaps_no_school",
      message: "The date remains no school.",
      dates: ["2026-12-23"],
    }]).automaticallyResolvedWarnings[0];

    expect(getCalendarWarningDateDetails(result, warning)).toEqual([{
      date: "2026-12-23",
      specialLabels: ["Admission Day"],
      noSchoolLabels: ["Christmas Recess"],
      currentClassification: "No school",
      suggestedResult: "Keep the date as no school, preserve both labels, and remove any student schedule assignment.",
      rotationEffect: "The schedule rotation pauses on this date.",
    }]);
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
    expect(items.some((item) => item.status === "blocked")).toBe(false);
    expect(items.find((item) => item.label.startsWith("Bell times"))).toMatchObject({ status: "complete_later" });
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
    expect(items.filter((item) => item.status === "blocked").length).toBeGreaterThanOrEqual(4);
  });
});
