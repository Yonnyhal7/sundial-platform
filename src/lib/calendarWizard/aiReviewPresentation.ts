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
    const key = `${warning.classification}|${warning.code}|${warning.message.trim().toLowerCase()}`;
    if (!retained.has(key)) retained.set(key, warning);
  }
  return [...retained.values()];
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

export type AiReviewReadinessStatus = "pass" | "warning" | "fail";

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
      status: importResult.schoolYear.startDate && importResult.schoolYear.endDate ? "pass" : "fail",
    },
    {
      label: "Instructional-day count reviewed",
      status: countReviewState.ready ? "pass" : "fail",
      detail: !countReview
        ? `${currentInstructionalDayCount} generated`
        : countReviewState.status === "acknowledged"
          ? `Administrator reviewed ${countReview.discrepancyDates.length}-date difference · Final instructional count: ${currentInstructionalDayCount}`
          : `PDF declares ${countReview.declaredInstructionalDayCount} days; Sundial currently identifies ${currentInstructionalDayCount}`,
    },
    { label: "No-school dates reviewed", status: "pass" },
    {
      label: "Schedule templates detected",
      status: importResult.detectedSchedules.length > 0 ? "pass" : "fail",
    },
    {
      label: "First instructional day assigned",
      status: firstInstructionalDay?.scheduleId ? "pass" : "fail",
    },
    {
      label: "First two instructional weeks verified",
      status: firstTwoWeeksVerified ? "pass" : "fail",
    },
    {
      label: "No unresolved schedule assignments",
      status: unresolvedAssignmentCount === 0 ? "pass" : "fail",
      detail: unresolvedAssignmentCount > 0 ? `${unresolvedAssignmentCount} unresolved` : undefined,
    },
    {
      label: "No blocking conflicts",
      status: blockingConflictCount === 0 ? "pass" : "fail",
      detail: blockingConflictCount > 0 ? `${blockingConflictCount} blocking` : undefined,
    },
    {
      label: "Preview matches creation payload",
      status: previewMatchesCreationPayload ? "pass" : "fail",
      detail: "Verified again before saving",
    },
    {
      label: "Bell times acknowledged as now or later",
      status: schedulesNeedingBellTimes > 0 ? "warning" : "pass",
      detail: schedulesNeedingBellTimes > 0
        ? `${schedulesNeedingBellTimes} schedule${schedulesNeedingBellTimes === 1 ? "" : "s"} can be completed later`
        : undefined,
    },
  ];
}
