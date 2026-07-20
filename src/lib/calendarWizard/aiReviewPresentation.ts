import type { ClassifiedCalendarWarning } from "./aiQuickSetupPersistence";
import type {
  AiCalendarImportResult,
  AiImportAutomaticResolution,
} from "./aiImportTypes";
import { canonicalScheduleName } from "./scheduleIdentity";
import type { GeneratedCalendarDay } from "./types";
import { getInstructionalDayCountReviewState } from "./instructionalDayCountReview";

export type AiReviewPresentationActionId =
  | "use_regular_schedule"
  | "set_up_rotation"
  | "mark_school_day"
  | "mark_no_school"
  | "review_date"
  | "remove_event"
  | "change_date"
  | "keep_outside_event"
  | "review_count_dates"
  | "use_pdf_count"
  | "keep_sundial_count"
  | "review_details"
  | "dismiss";

export type AiReviewIssuePresentation = {
  title: string;
  description: string;
  affectedSummary?: string;
  actions: Array<{ id: AiReviewPresentationActionId; label: string }>;
};

type PresentationContext = {
  issue: ClassifiedCalendarWarning;
  importResult: AiCalendarImportResult;
  currentInstructionalDayCount: number;
};

type PresentationBuilder = (context: PresentationContext) => AiReviewIssuePresentation;

const displayDate = (date: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));

function schoolYearRange(importResult: AiCalendarImportResult) {
  return `${displayDate(importResult.schoolYear.instructionalStart || importResult.schoolYear.startDate)} through ${displayDate(importResult.schoolYear.instructionalEnd || importResult.schoolYear.endDate)}`;
}

function eventForIssue({ issue, importResult }: PresentationContext) {
  return importResult.specialDays.find((event) =>
    issue.affectedDates.some((date) => date >= event.startDate && date <= event.endDate)
  );
}

function affectedSummary(dates: string[]) {
  if (dates.length === 0) return undefined;
  if (dates.length === 1) return displayDate(dates[0]);
  return `${dates.length} dates`;
}

const REVIEW_PRESENTATION_BUILDERS: Record<string, PresentationBuilder> = {
  schedule_default_inferred: () => ({
    title: "No rotating schedule was found",
    description: "Sundial assigned every instructional day to Regular Schedule. Does this school use a rotating schedule such as Brown/Gold?",
    actions: [
      { id: "use_regular_schedule", label: "Use Regular Schedule" },
      { id: "set_up_rotation", label: "Set Up a Rotation" },
    ],
  }),
  schedule_resolution_required: ({ issue }) => ({
    title: "A schedule needs confirmation",
    description: "Choose the school schedule that should apply before creating the calendar.",
    affectedSummary: affectedSummary(issue.affectedDates),
    actions: [
      { id: "set_up_rotation", label: "Choose a Schedule" },
      { id: "review_details", label: "Review Details" },
    ],
  }),
  low_confidence_classification: ({ issue, importResult }) => {
    const date = issue.affectedDates[0];
    const current = importResult.dateClassifications?.find((item) => item.date === date);
    const isSchoolDay = current?.classification === "instructional";
    return {
      title: issue.affectedDates.length === 1 ? "One date needs confirmation" : `${issue.affectedDates.length} dates need confirmation`,
      description: "Sundial was not fully certain how to classify this date. Review it before continuing.",
      affectedSummary: affectedSummary(issue.affectedDates),
      actions: [
        { id: isSchoolDay ? "mark_school_day" : "mark_no_school", label: isSchoolDay ? "Mark as School Day" : "Mark as No School" },
        { id: "review_date", label: issue.affectedDates.length === 1 ? "Review Date" : "Review Dates" },
      ],
    };
  },
  special_day_outside_school_year: (context) => {
    const event = eventForIssue(context);
    const eventName = event?.label?.trim();
    return {
      title: eventName ? `${eventName} is outside the school year` : "A special day falls outside the school year",
      description: eventName
        ? `‘${eventName}’ falls outside ${schoolYearRange(context.importResult)}.`
        : "This event is outside the selected calendar range and will not appear on the school calendar.",
      affectedSummary: affectedSummary(context.issue.affectedDates),
      actions: [
        { id: "remove_event", label: "Remove This Event" },
        { id: "change_date", label: "Change the Date" },
        { id: "keep_outside_event", label: eventName ? "Keep as an Outside Event" : "Keep Outside the Calendar" },
      ],
    };
  },
  special_day_outside_range: (context) => REVIEW_PRESENTATION_BUILDERS.special_day_outside_school_year(context),
  named_event_outside_school_year: (context) => REVIEW_PRESENTATION_BUILDERS.special_day_outside_school_year(context),
  named_event_outside_range: (context) => REVIEW_PRESENTATION_BUILDERS.special_day_outside_school_year(context),
  no_school_range_outside_year: ({ issue }) => ({
    title: "A no-school period falls outside the school year",
    description: "Part of this no-school period is outside the selected calendar range.",
    affectedSummary: affectedSummary(issue.affectedDates),
    actions: [
      { id: "change_date", label: "Change the Dates" },
      { id: "dismiss", label: "Keep Outside the Calendar" },
    ],
  }),
  overlapping_special_days: ({ issue }) => ({
    title: "Special days overlap",
    description: "Two or more special-day entries cover the same date. Review which events should remain.",
    affectedSummary: affectedSummary(issue.affectedDates),
    actions: [
      { id: "review_date", label: issue.affectedDates.length === 1 ? "Review This Date" : "Review These Dates" },
      { id: "dismiss", label: "Keep Both Events" },
    ],
  }),
  duplicate_special_day: ({ issue }) => ({
    title: "A special day appears more than once",
    description: "Sundial found matching special-day entries. Review the duplicate before continuing.",
    affectedSummary: affectedSummary(issue.affectedDates),
    actions: [
      { id: "review_date", label: "Review Duplicate" },
      { id: "dismiss", label: "Keep Both Entries" },
    ],
  }),
  instructional_day_count_mismatch: ({ issue, importResult, currentInstructionalDayCount }) => {
    const declared = importResult.instructionalDayCountReview?.declaredInstructionalDayCount
      ?? importResult.declaredInstructionalDayCount
      ?? importResult.expectedInstructionalDayCount
      ?? currentInstructionalDayCount;
    const difference = Math.abs(currentInstructionalDayCount - declared);
    return {
      title: "Instructional-day count does not match",
      description: `The PDF states ${declared} instructional days, but Sundial currently counts ${currentInstructionalDayCount}. Review the ${difference} ${difference === 1 ? "date" : "dates"} before creating the calendar.`,
      affectedSummary: affectedSummary(issue.affectedDates),
      actions: [
        { id: "review_count_dates", label: `Review the ${difference} ${difference === 1 ? "Date" : "Dates"}` },
        { id: "use_pdf_count", label: `Use PDF Count: ${declared}` },
        { id: "keep_sundial_count", label: `Keep Sundial Count: ${currentInstructionalDayCount}` },
      ],
    };
  },
};

export const AI_REVIEW_PRESENTATION_ISSUE_CODES = Object.freeze(Object.keys(REVIEW_PRESENTATION_BUILDERS));

export function getAiReviewIssuePresentation(context: PresentationContext): AiReviewIssuePresentation {
  return REVIEW_PRESENTATION_BUILDERS[context.issue.issueCode]?.(context) || {
    title: "Review this calendar item",
    description: "Review the calendar details and choose whether to keep this item.",
    affectedSummary: affectedSummary(context.issue.affectedDates),
    actions: [
      { id: "review_details", label: "Review Details" },
      { id: "dismiss", label: "Dismiss" },
    ],
  };
}

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
