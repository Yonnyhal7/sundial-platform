import type { ClassifiedCalendarWarning } from "./aiQuickSetupPersistence";
import type {
  AiCalendarImportResult,
  AiImportAutomaticResolution,
} from "./aiImportTypes";
import { canonicalScheduleName } from "./scheduleIdentity";
import type { GeneratedCalendarDay } from "./types";
import { getInstructionalDayCountReviewState } from "./instructionalDayCountReview";

const exceptionScheduleTerms = [
  "all-period",
  "final",
  "rally",
  "minimum-day",
  "assembly",
];

export function isTrueScheduleExceptionName(name: string) {
  const canonical = canonicalScheduleName(name);
  return exceptionScheduleTerms.some((term) => canonical.includes(term));
}

export function getTrueScheduleExceptionDates(importResult: AiCalendarImportResult) {
  const exceptionScheduleIds = new Set(
    importResult.detectedSchedules
      .filter((schedule) =>
        ["special", "finals", "minimum"].includes(schedule.category) ||
        isTrueScheduleExceptionName(schedule.detectedName)
      )
      .map((schedule) => schedule.tempId)
  );
  const dates = new Set(
    (importResult.datedScheduleAssignments || [])
      .filter((assignment) =>
        exceptionScheduleIds.has(assignment.scheduleTempId) ||
        isTrueScheduleExceptionName(assignment.scheduleName)
      )
      .map((assignment) => assignment.date)
  );
  for (const day of importResult.specialDays) {
    if (!day.isInstructional) continue;
    if (
      (day.scheduleTempId && exceptionScheduleIds.has(day.scheduleTempId)) ||
      isTrueScheduleExceptionName(day.label)
    ) {
      dates.add(day.startDate);
    }
  }
  return [...dates].sort();
}

export function assignmentSourcePresentation(
  source: GeneratedCalendarDay["assignmentSource"]
) {
  switch (source) {
    case "pdf_vector_fill":
      return { friendly: "Detected from PDF color", internal: "pdf_vector_fill" };
    case "explicit_text":
      return { friendly: "Detected from PDF text", internal: "explicit_text" };
    case "pattern_generated":
      return { friendly: "Generated from schedule pattern", internal: "pattern_generated" };
    case "administrator":
      return { friendly: "Edited by administrator", internal: "administrator" };
    case "no_school":
      return { friendly: "No-school date", internal: "no_school" };
    case "staff_only":
      return { friendly: "Staff-only / inservice", internal: "staff_only" };
    case "neutral_non_operating":
      return { friendly: "Informational / non-operating", internal: "neutral_non_operating" };
    case "genuine_special":
      return { friendly: "Detected nonstandard schedule", internal: "genuine_special" };
    default:
      return { friendly: "No assignment", internal: "unassigned" };
  }
}

export function deduplicateClassifiedWarnings(warnings: ClassifiedCalendarWarning[]) {
  const retained = new Map<string, ClassifiedCalendarWarning>();
  for (const warning of warnings) {
    const key = warning.issueId;
    if (!retained.has(key)) retained.set(key, warning);
  }
  return [...retained.values()];
}

export type CalendarWarningDateDetails = {
  date: string;
  specialLabels: string[];
  noSchoolLabels: string[];
  currentClassification: "No school" | "Instructional" | "Needs correction";
  suggestedResult: string;
  rotationEffect: string;
};

export function getCalendarWarningDateDetails(
  importResult: AiCalendarImportResult,
  warning: ClassifiedCalendarWarning
): CalendarWarningDateDetails[] {
  return warning.affectedDates.map((date) => {
    const noSchoolLabels = importResult.noSchoolRanges
      .filter((range) => date >= range.startDate && date <= range.endDate)
      .map((range) => range.label);
    const specialLabels = [
      ...importResult.specialDays
        .filter((day) => date >= day.startDate && date <= day.endDate)
        .map((day) => day.label),
      ...importResult.informationalDates
        .filter((item) => item.date === date)
        .map((item) => item.label),
    ];
    const isSafeNoSchoolOverlap =
      warning.issueCode === "special_day_overlaps_no_school" ||
      warning.classification === "automatically_resolved";
    return {
      date,
      specialLabels: [...new Set(specialLabels)],
      noSchoolLabels: [...new Set(noSchoolLabels)],
      currentClassification: isSafeNoSchoolOverlap ? "No school" : "Needs correction",
      suggestedResult: isSafeNoSchoolOverlap
        ? "Keep the date as no school, preserve both labels, and remove any student schedule assignment."
        : warning.suggestedCorrection || "Review the source details and save a valid calendar-day classification.",
      rotationEffect: isSafeNoSchoolOverlap
        ? "The schedule rotation pauses on this date."
        : "Rotation will be recalculated after the date is saved.",
    };
  });
}

export function includedNoSchoolLabels(
  startDate: string,
  endDate: string,
  automaticResolutions: AiImportAutomaticResolution[] = []
) {
  return [...new Set(
    automaticResolutions
      .filter((resolution) =>
        resolution.dateRange &&
        resolution.dateRange.startDate >= startDate &&
        resolution.dateRange.endDate <= endDate
      )
      .flatMap((resolution) => resolution.labelsPreserved || [])
      .map((label) => label.trim())
      .filter(Boolean)
  )];
}

export type AiReviewReadinessStatus =
  | "ready"
  | "reviewed"
  | "complete_later"
  | "blocked";

export type AiReviewReadinessItem = {
  label: string;
  status: AiReviewReadinessStatus;
  detail?: string;
};

export function buildAiReviewReadiness({
  importResult,
  previewDays,
  firstTwoWeeksVerified,
  unresolvedAssignmentCount,
  blockingConflictCount,
  previewMatchesCreationPayload,
  schedulesNeedingBellTimes,
  currentInstructionalDayCount,
}: {
  importResult: AiCalendarImportResult;
  previewDays: GeneratedCalendarDay[];
  firstTwoWeeksVerified: boolean;
  unresolvedAssignmentCount: number;
  blockingConflictCount: number;
  previewMatchesCreationPayload: boolean;
  schedulesNeedingBellTimes: number;
  currentInstructionalDayCount: number;
}): AiReviewReadinessItem[] {
  const firstInstructionalDay = previewDays.find((day) => day.isSchoolDay);
  const countReviewState = getInstructionalDayCountReviewState(
    importResult.instructionalDayCountReview,
    currentInstructionalDayCount
  );
  const countReview = importResult.instructionalDayCountReview;
  return [
    {
      label: "School year dates confirmed",
      status: importResult.schoolYear.startDate && importResult.schoolYear.endDate ? "ready" : "blocked",
    },
    {
      label: "Calendar dates generated",
      status: previewDays.length > 0 ? "ready" : "blocked",
    },
    {
      label: "Instructional-day count acknowledged",
      status: countReviewState.ready ? (countReview ? "reviewed" : "ready") : "blocked",
      detail: !countReview
        ? `${currentInstructionalDayCount} generated`
        : countReviewState.ready
          ? `${countReviewState.status === "resolved" ? "Dates reviewed individually" : "Difference acknowledged"} · Final instructional count: ${currentInstructionalDayCount}`
          : `PDF declares ${countReview.declaredInstructionalDayCount} days; Sundial currently identifies ${currentInstructionalDayCount}`,
    },
    { label: "No-school overlaps reviewed", status: "reviewed" },
    {
      label: "Schedule templates detected",
      status: importResult.detectedSchedules.length > 0 ? "ready" : "blocked",
    },
    {
      label: "First instructional day assigned",
      status: firstInstructionalDay?.scheduleId ? "ready" : "blocked",
    },
    {
      label: "First two instructional weeks verified",
      status: firstTwoWeeksVerified ? "ready" : "blocked",
    },
    {
      label: "No unresolved schedule assignments",
      status: unresolvedAssignmentCount === 0 ? "ready" : "blocked",
      detail: unresolvedAssignmentCount > 0 ? `${unresolvedAssignmentCount} unresolved` : undefined,
    },
    {
      label: "No blocking conflicts",
      status: blockingConflictCount === 0 ? "ready" : "blocked",
      detail: blockingConflictCount > 0 ? `${blockingConflictCount} blocking` : undefined,
    },
    {
      label: "Preview matches creation payload",
      status: previewMatchesCreationPayload ? "ready" : "blocked",
      detail: "Verified again before saving",
    },
    {
      label: "Bell times acknowledged as now or later",
      status: schedulesNeedingBellTimes > 0 ? "complete_later" : "ready",
      detail: schedulesNeedingBellTimes > 0
        ? `${schedulesNeedingBellTimes} schedule${schedulesNeedingBellTimes === 1 ? "" : "s"} can be completed later`
        : undefined,
    },
  ];
}
