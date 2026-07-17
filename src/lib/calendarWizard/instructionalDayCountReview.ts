import type {
  AiCalendarImportResult,
  AiDateClassification,
  AiImportConfidence,
  AiInstructionalDayCountReview,
  AiInstructionalDayCountReviewDate,
} from "./aiImportTypes";
import type {
  CalendarDateClassification,
  CalendarGenerationResult,
  GeneratedCalendarDay,
} from "./types";

function confidenceNumber(confidence: AiImportConfidence | undefined) {
  if (confidence === "high") return 0.95;
  if (confidence === "uncertain") return 0.35;
  return 0.6;
}

function generatedClassification(day: GeneratedCalendarDay): CalendarDateClassification {
  if (day.classification) return day.classification;
  if (day.isSchoolDay) return "instructional";
  return day.isOperatingDay ? "no_school" : "neutral_non_operating";
}

function sourceDetails(importResult: AiCalendarImportResult, day: GeneratedCalendarDay) {
  const noSchool = importResult.noSchoolRanges.find(
    (range) => day.date >= range.startDate && day.date <= range.endDate
  );
  const special = importResult.specialDays.find(
    (range) => day.date >= range.startDate && day.date <= range.endDate
  );
  const info = importResult.informationalDates.find((item) => item.date === day.date);
  const assignment = importResult.datedScheduleAssignments?.find(
    (item) => item.date === day.date
  );
  return {
    sourceLabel:
      noSchool?.label || special?.label || info?.label || assignment?.scheduleName ||
      day.labels.join(", ") || "Generated calendar date",
    confidence:
      assignment?.confidence ??
      special?.assignmentConfidence ??
      confidenceNumber(noSchool?.confidence || special?.confidence || info?.confidence),
  };
}

function reviewDate(
  importResult: AiCalendarImportResult,
  day: GeneratedCalendarDay
): AiInstructionalDayCountReviewDate {
  const classification = generatedClassification(day);
  const source = sourceDetails(importResult, day);
  return {
    date: day.date,
    initialClassification: classification,
    classification,
    scheduleTempId: day.scheduleId,
    label: day.labels.join(", ") || undefined,
    sourceLabel: source.sourceLabel,
    confidence: source.confidence,
    rotationBehavior: "pause",
    reviewed: false,
  };
}

export function detectInstructionalDayCountDiscrepancyDates(
  importResult: AiCalendarImportResult,
  preview: CalendarGenerationResult
) {
  const instructionalStart =
    importResult.schoolYear.instructionalStart || importResult.schoolYear.startDate;
  const instructionalEnd =
    importResult.schoolYear.instructionalEnd || importResult.schoolYear.endDate;
  const difference = Math.abs(
    preview.summary.instructionalDayCount -
      (importResult.declaredInstructionalDayCount ??
        importResult.expectedInstructionalDayCount ??
        preview.summary.instructionalDayCount)
  );

  const boundaryCandidates = preview.days.filter(
    (day) =>
      (day.date < instructionalStart || day.date > instructionalEnd) &&
      (day.isOperatingDay || day.labels.length > 0)
  );
  const selectedDates = new Set(boundaryCandidates.map((day) => day.date));
  const lowerConfidenceInstructional = preview.days
    .filter(
      (day) =>
        day.isSchoolDay &&
        !selectedDates.has(day.date) &&
        day.assignmentSource !== "pdf_vector_fill" &&
        day.assignmentSource !== "explicit_text"
    )
    .sort((left, right) => {
      const leftConfidence = sourceDetails(importResult, left).confidence;
      const rightConfidence = sourceDetails(importResult, right).confidence;
      return leftConfidence - rightConfidence || left.date.localeCompare(right.date);
    });

  const targetCount = Math.max(difference, boundaryCandidates.length);
  const candidates = [...boundaryCandidates];
  for (const day of lowerConfidenceInstructional) {
    if (candidates.length >= targetCount) break;
    candidates.push(day);
  }
  return candidates.map((day) => reviewDate(importResult, day));
}

export function initializeInstructionalDayCountReview(
  importResult: AiCalendarImportResult,
  preview: CalendarGenerationResult
): AiCalendarImportResult {
  const declaredInstructionalDayCount =
    importResult.declaredInstructionalDayCount ??
    importResult.expectedInstructionalDayCount ??
    null;
  const generatedInstructionalDayCount = preview.summary.instructionalDayCount;
  const base = {
    ...importResult,
    declaredInstructionalDayCount,
    generatedInstructionalDayCount,
  };
  if (
    declaredInstructionalDayCount === null ||
    declaredInstructionalDayCount === generatedInstructionalDayCount
  ) {
    return { ...base, instructionalDayCountReview: undefined };
  }
  return {
    ...base,
    instructionalDayCountReview: {
      reasonCode: "instructional_day_count_mismatch",
      declaredInstructionalDayCount,
      generatedInstructionalDayCount,
      discrepancyDates: detectInstructionalDayCountDiscrepancyDates(base, preview),
      acknowledged: false,
    },
  };
}

export function updateInstructionalDayCountReviewDate(
  importResult: AiCalendarImportResult,
  classification: AiDateClassification
) {
  const review = importResult.instructionalDayCountReview;
  if (!review) return importResult;
  return {
    ...importResult,
    instructionalDayCountReview: {
      ...review,
      acknowledged: false,
      finalApprovedInstructionalDayCount: undefined,
      discrepancyDates: review.discrepancyDates.map((item) =>
        item.date === classification.date
          ? { ...item, ...classification, reviewed: true }
          : item
      ),
    },
  };
}

export function getInstructionalDayCountReviewState(
  review: AiInstructionalDayCountReview | undefined,
  currentInstructionalDayCount: number
) {
  if (!review) {
    return { status: "resolved" as const, ready: true, unresolvedDates: [] as string[] };
  }
  const unresolvedDates = review.discrepancyDates
    .filter((item) => !item.reviewed)
    .map((item) => item.date);
  if (unresolvedDates.length === 0) {
    return { status: "resolved" as const, ready: true, unresolvedDates };
  }
  if (
    review.acknowledged &&
    review.finalApprovedInstructionalDayCount === currentInstructionalDayCount
  ) {
    return { status: "acknowledged" as const, ready: true, unresolvedDates };
  }
  return { status: "pending" as const, ready: false, unresolvedDates };
}

export function acknowledgeInstructionalDayCountReview(
  importResult: AiCalendarImportResult,
  currentInstructionalDayCount: number,
  acknowledged: boolean,
  reviewNote?: string
) {
  const review = importResult.instructionalDayCountReview;
  if (!review) return importResult;
  return {
    ...importResult,
    instructionalDayCountReview: {
      ...review,
      acknowledged,
      finalApprovedInstructionalDayCount:
        acknowledged ? currentInstructionalDayCount : undefined,
      reviewNote: reviewNote?.trim() || undefined,
    },
  };
}
