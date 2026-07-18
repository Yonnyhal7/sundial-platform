import { randomUUID } from "node:crypto";
import {
  getDetectedScheduleUsageCounts,
  getRequiredDetectedScheduleIds,
} from "./aiImportConversion";
import { eachDateInRange, isDateString } from "./dateUtils";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import type {
  AiCalendarImportResult,
  AiImportWarning,
  AiImportWarningResolution,
  DetectedScheduleResolution,
} from "./aiImportTypes";
import { normalizeScheduleNameForMatching } from "./aiScheduleMatching";
import { getAiScheduleDefaultColor, normalizeHexColor } from "@/lib/scheduleColors";
import type { CalendarDayInsertRow } from "./persistence";
import type {
  CalendarGenerationWarning,
  CalendarWizardConfig,
  Weekday,
} from "./types";

export type ExistingScheduleForAiPersistence = {
  id: string;
  name: string;
  active: boolean | null;
  setupStatus?: string | null;
  calendarColor?: string | null;
};

export type AiScheduleToCreate = {
  tempId: string;
  id: string;
  scheduleName: string;
  scheduleType: string | null;
  calendarColor: string | null;
  setupStatus: "needs_times";
};

export type AiScheduleResolutionPlan = {
  tempToScheduleId: Record<string, string>;
  schedulesToCreate: AiScheduleToCreate[];
  matchedScheduleIds: string[];
  schedulesNeedingTimes: Array<{ id: string; name: string }>;
  conflict?: string;
};

export type RemovedAiScheduleRecord = NonNullable<
  import("./aiImportTypes").AiImportDraftMetadata["removedSchedules"]
>[number];

export type AiScheduleRemovalAction =
  | { type: "remove_unused" }
  | { type: "reassign"; replacementScheduleId: string }
  | { type: "mark_no_school" };

export type AiScheduleUsageDetails = {
  tempId: string;
  calendarDayCount: number;
  dates: string[];
  patternReferenceCount: number;
  specialDayReferenceCount: number;
  isReferenced: boolean;
};

export type AiScheduleRemovalResult =
  | {
      success: true;
      importResult: AiCalendarImportResult;
      removedSchedule: RemovedAiScheduleRecord;
      affectedDayCount: number;
    }
  | {
      success: false;
      message: string;
    };

type ClassifiableCalendarWarning =
  (
    | AiImportWarning
    | (CalendarGenerationWarning & { severity?: AiImportWarning["severity"] })
  ) & {
    createdBy?: "ai_response" | "import_normalizer" | "calendar_generator" | "review_issue_normalizer";
    sourceArray?: string;
    persistedOrGenerated?: "persisted" | "generated" | "normalized";
    analysisVersion?: string;
  };

export type CalendarWarningClassificationKind =
  | "blocking"
  | "needs_review"
  | "automatically_resolved"
  | "informational";

export type CalendarReviewIssueStatus =
  | "unresolved"
  | "acknowledged"
  | "automatically_resolved"
  | "manually_resolved";

export type ClassifiedCalendarWarning = Omit<ClassifiableCalendarWarning, "severity"> & {
  issueId: string;
  issueCode: string;
  affectedDates: string[];
  severity: CalendarWarningClassificationKind;
  status: CalendarReviewIssueStatus;
  classification: CalendarWarningClassificationKind;
  resolved: boolean;
  suggestedCorrection?: string;
  resolution?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  relevantLabelIdentities: string[];
  createdBy: "ai_response" | "import_normalizer" | "calendar_generator" | "review_issue_normalizer";
  sourceArray: string;
  originalSeverity: AiImportWarning["severity"] | "unspecified";
  finalSeverity: CalendarWarningClassificationKind;
  finalStatus: CalendarReviewIssueStatus;
  persistedOrGenerated: "persisted" | "generated" | "normalized";
  analysisVersion?: string;
};

export type CalendarWarningClassification = {
  blockingWarnings: ClassifiedCalendarWarning[];
  needsReviewWarnings: ClassifiedCalendarWarning[];
  automaticallyResolvedWarnings: ClassifiedCalendarWarning[];
  informationalWarnings: ClassifiedCalendarWarning[];
  unacknowledgedReviewWarnings: ClassifiedCalendarWarning[];
  acknowledgedReviewWarnings: ClassifiedCalendarWarning[];
  /** Compatibility aliases for callers that still use the former names. */
  reviewWarnings: ClassifiedCalendarWarning[];
  unresolvedReviewWarnings: ClassifiedCalendarWarning[];
  resolvedReviewWarnings: ClassifiedCalendarWarning[];
};

const blockingWarningCodes = new Set([
  "start_date_after_end_date",
  "school_year_dates_reversed",
  "invalid_school_year_range",
  "invalid_date_value",
  "no_operating_weekdays",
  "instructional_day_missing_schedule",
  "weekday_pattern_missing_schedule",
  "repeating_pattern_missing_schedules",
  "unknown_pattern_schedule_reference",
  "unknown_special_day_schedule_reference",
  "unresolved_schedule_reference",
  "schedule_assignment_wrong_school",
  "orphaned_schedule_reference",
]);

const needsReviewWarningCodes = new Set([
  "instructional_day_count_mismatch",
  "schedule_resolution_required",
  "special_day_outside_school_year",
  "no_school_range_outside_year",
  "overlapping_special_days",
  "duplicate_special_day",
]);

const automaticallyResolvedWarningCodes = new Set([
  "duplicate_import_item_removed",
  "overlapping_no_school_ranges",
  "special_day_overlaps_no_school",
  "informational_label_inside_no_school",
  "duplicate_label_removed",
  "punctuation_variant_schedule_name",
  "duplicate_no_school_coverage",
]);

const informationalWarningCodes = new Set([
  "mock_analyzer",
  "needs_times",
  "schedule_needs_times",
  "missing_bell_times",
  "bell_times_needed",
]);

function resolutionIsComplete(resolution: AiImportWarningResolution | undefined) {
  return Boolean(
    resolution &&
      resolution.status !== "unreviewed" &&
      resolution.status !== "unresolved"
  );
}

function warningDates(warning: ClassifiableCalendarWarning) {
  return "dates" in warning && Array.isArray(warning.dates)
    ? [...new Set(warning.dates)].sort()
    : [];
}

function warningSourceIds(warning: ClassifiableCalendarWarning) {
  return "sourceIds" in warning && Array.isArray(warning.sourceIds)
    ? [...new Set(warning.sourceIds)].sort()
    : [];
}

function isSemanticSafeNoSchoolOverlap(warning: ClassifiableCalendarWarning) {
  const value = `${warning.code || ""} ${warning.message || ""}`.toLowerCase();
  const mentionsNoSchool = /no[-\s]?school/.test(value);
  const mentionsNestedLabel =
    /special.*overlap/.test(value) ||
    /informational.*(?:inside|overlap|occurs during)/.test(value) ||
    /date remains no[-\s]?school/.test(value) ||
    /kept (?:the date )?as no[-\s]?school/.test(value);
  return mentionsNoSchool && mentionsNestedLabel;
}

function normalizedWarningCode(warning: ClassifiableCalendarWarning) {
  return isSemanticSafeNoSchoolOverlap(warning)
    ? "informational_label_inside_no_school"
    : String(warning.code || "calendar_warning");
}

export function getCalendarWarningIssueId(warning: ClassifiableCalendarWarning) {
  const dates = warningDates(warning);
  const sources = warningSourceIds(warning);
  return [normalizedWarningCode(warning), dates.join(","), sources.join(",")]
    .map((part) => part || "none")
    .join("::");
}

function issueStatus(
  classification: CalendarWarningClassificationKind,
  resolution: AiImportWarningResolution | undefined
): CalendarReviewIssueStatus {
  if (classification === "automatically_resolved") return "automatically_resolved";
  if (!resolutionIsComplete(resolution)) return "unresolved";
  if (
    resolution?.status === "edited_manually" ||
    resolution?.status === "manually_resolved" ||
    resolution?.status === "accepted_suggestion"
  ) {
    return "manually_resolved";
  }
  return "acknowledged";
}

function suggestedCorrection(warning: ClassifiableCalendarWarning) {
  const code = String(warning.code || "");
  if (code === "special_day_overlaps_no_school") {
    return "Keep the date as no school, preserve all labels, remove the student schedule, and pause rotation.";
  }
  if (code === "instructional_day_missing_schedule") {
    return "Assign a valid school-owned schedule to the instructional date.";
  }
  return undefined;
}

function classifyWarningKind(
  warning: ClassifiableCalendarWarning
): CalendarWarningClassificationKind {
  const code = String(warning.code || "");
  const message = warning.message.toLowerCase();

  if (blockingWarningCodes.has(code)) return "blocking";
  if (
    automaticallyResolvedWarningCodes.has(code) ||
    isSemanticSafeNoSchoolOverlap(warning) ||
    (message.includes("special school day overlaps") &&
      message.includes("no-school day") &&
      message.includes("remains no school"))
  ) {
    return "automatically_resolved";
  }

  if (
    informationalWarningCodes.has(code) ||
    code.includes("needs_times") ||
    code.includes("bell_times") ||
    message.includes("bell times")
  ) {
    return "informational";
  }

  if (
    needsReviewWarningCodes.has(code) ||
    message.includes("source-document date typo") ||
    message.includes("source document date typo") ||
    (message.includes("april 30") && message.includes("2026") && message.includes("2027")) ||
    message.includes("confidence") ||
    message.includes("uncertain")
  ) {
    return "needs_review";
  }

  if ("severity" in warning) {
    if (warning.severity === "info") return "informational";
    if (warning.severity === "review") return "needs_review";
    if (warning.severity === "blocking") return "blocking";
  }

  return "needs_review";
}

export function classifyCalendarWarnings(
  warnings: ClassifiableCalendarWarning[] = [],
  warningResolutions: AiImportWarningResolution[] = []
): CalendarWarningClassification {
  const resolutionsByIssueId = new Map(
    warningResolutions
      .filter((resolution) => resolution.issueId)
      .map((resolution) => [resolution.issueId as string, resolution])
  );
  const legacyResolutionsByCode = new Map(
    warningResolutions
      .filter((resolution) => !resolution.issueId)
      .map((resolution) => [resolution.code, resolution])
  );
  const blockingWarnings: ClassifiedCalendarWarning[] = [];
  const needsReviewWarnings: ClassifiedCalendarWarning[] = [];
  const automaticallyResolvedWarnings: ClassifiedCalendarWarning[] = [];
  const informationalWarnings: ClassifiedCalendarWarning[] = [];

  for (const warning of warnings) {
    const classification = classifyWarningKind(warning);
    const issueCode = normalizedWarningCode(warning);
    const issueId = getCalendarWarningIssueId(warning);
    const resolution =
      resolutionsByIssueId.get(issueId) || legacyResolutionsByCode.get(warning.code);
    const status = issueStatus(classification, resolution);
    const resolved = status !== "unresolved";
    const classified: ClassifiedCalendarWarning = {
      ...warning,
      issueId,
      issueCode,
      affectedDates: warningDates(warning),
      severity: classification,
      status,
      classification,
      resolved,
      suggestedCorrection: suggestedCorrection(warning),
      resolution: resolution?.resolution,
      reviewedBy: resolution?.reviewedBy,
      reviewedAt: resolution?.reviewedAt,
      relevantLabelIdentities: [],
      createdBy:
        warning.createdBy ||
        (warningDates(warning).length > 0 ? "calendar_generator" : "ai_response"),
      sourceArray:
        warning.sourceArray ||
        (warningDates(warning).length > 0 ? "generationWarnings" : "importResult.warnings"),
      originalSeverity:
        "severity" in warning && warning.severity ? warning.severity : "unspecified",
      finalSeverity: classification,
      finalStatus: status,
      persistedOrGenerated:
        warning.persistedOrGenerated ||
        (warningDates(warning).length > 0 ? "generated" : "persisted"),
      analysisVersion: warning.analysisVersion,
    };

    if (classification === "blocking") {
      if (status === "unresolved") blockingWarnings.push(classified);
    } else if (classification === "needs_review") {
      needsReviewWarnings.push(classified);
    } else if (classification === "automatically_resolved") {
      automaticallyResolvedWarnings.push(classified);
    } else {
      informationalWarnings.push(classified);
    }
  }

  const unacknowledgedReviewWarnings = needsReviewWarnings.filter(
    (warning) => !warning.resolved
  );
  const acknowledgedReviewWarnings = needsReviewWarnings.filter(
    (warning) => warning.resolved
  );

  return {
    blockingWarnings,
    needsReviewWarnings,
    automaticallyResolvedWarnings,
    informationalWarnings,
    unacknowledgedReviewWarnings,
    acknowledgedReviewWarnings,
    reviewWarnings: needsReviewWarnings,
    unresolvedReviewWarnings: unacknowledgedReviewWarnings,
    resolvedReviewWarnings: acknowledgedReviewWarnings,
  };
}

function labelsForIssue(importResult: AiCalendarImportResult, dates: string[]) {
  const labels = new Set<string>();
  for (const date of dates) {
    for (const range of importResult.noSchoolRanges) {
      if (date >= range.startDate && date <= range.endDate) labels.add(range.label);
    }
    for (const day of importResult.specialDays) {
      if (date >= day.startDate && date <= day.endDate) labels.add(day.label);
    }
    for (const item of importResult.informationalDates) {
      if (item.date === date) labels.add(item.label);
    }
  }
  return [...labels]
    .map((label) => normalizeScheduleNameForMatching(label))
    .filter(Boolean)
    .sort();
}

function safeNoSchoolLabelWarnings(importResult: AiCalendarImportResult) {
  const warnings: ClassifiableCalendarWarning[] = [];
  for (const range of importResult.noSchoolRanges) {
    const nested = [
      ...importResult.informationalDates
        .filter((item) => item.date >= range.startDate && item.date <= range.endDate)
        .map((item) => ({
          id: item.id,
          startDate: item.date,
          endDate: item.date,
          label: item.label,
        })),
      ...importResult.specialDays
        .filter(
          (day) => day.startDate <= range.endDate && day.endDate >= range.startDate
        )
        .map((day) => ({
          id: day.id,
          startDate: day.startDate < range.startDate ? range.startDate : day.startDate,
          endDate: day.endDate > range.endDate ? range.endDate : day.endDate,
          label: day.label,
        })),
    ];
    for (const item of nested) {
      for (const date of eachDateInRange(item.startDate, item.endDate)) {
        warnings.push({
          code: "informational_label_inside_no_school",
          severity: "info",
          message: `${item.label} occurs during ${range.label}. Sundial kept the date as no school, preserved both labels, removed the student schedule assignment, and paused rotation.`,
          dates: [date],
          sourceIds: [range.id, item.id],
          createdBy: "review_issue_normalizer",
          sourceArray: "normalizedSafeNoSchoolLabels",
          persistedOrGenerated: "normalized",
        } as ClassifiableCalendarWarning);
      }
    }
  }
  return warnings;
}

export function normalizeAndDeduplicateReviewIssues({
  importResult,
  generationWarnings = [],
  warningResolutions = [],
  scheduleNameErrorCount = 0,
  analysisVersion,
}: {
  importResult: AiCalendarImportResult;
  generationWarnings?: CalendarGenerationWarning[];
  warningResolutions?: AiImportWarningResolution[];
  scheduleNameErrorCount?: number;
  analysisVersion?: string;
}) {
  const normalizedSafeWarnings = safeNoSchoolLabelWarnings(importResult).map((warning) => ({
    ...warning,
    analysisVersion,
  }));
  const hasNormalizedSafeIssue = normalizedSafeWarnings.length > 0;
  const persistedWarnings = importResult.warnings
    .filter((warning) => !(hasNormalizedSafeIssue && isSemanticSafeNoSchoolOverlap(warning)))
    .map((warning) => ({
      ...warning,
      createdBy: "import_normalizer" as const,
      sourceArray: "importResult.warnings",
      persistedOrGenerated: "persisted" as const,
      analysisVersion,
    }));
  const generatedWarnings = generationWarnings.map((warning) => ({
    ...warning,
    createdBy: "calendar_generator" as const,
    sourceArray: "generationWarnings",
    persistedOrGenerated: "generated" as const,
    analysisVersion,
  }));
  const classified = classifyCalendarWarnings(
    [...persistedWarnings, ...generatedWarnings, ...normalizedSafeWarnings],
    warningResolutions
  );
  const allIssues = [
    ...classified.blockingWarnings,
    ...classified.needsReviewWarnings,
    ...classified.automaticallyResolvedWarnings,
    ...classified.informationalWarnings,
  ];
  const retained = new Map<string, ClassifiedCalendarWarning>();
  for (const issue of allIssues) {
    const relevantLabelIdentities = labelsForIssue(importResult, issue.affectedDates);
    const normalizedIssue = { ...issue, relevantLabelIdentities };
    const key = [
      issue.issueCode,
      [...issue.affectedDates].sort().join(",") || "none",
      relevantLabelIdentities.join(",") || "none",
    ].join("::");
    const current = retained.get(key);
    if (
      !current ||
      (normalizedIssue.severity === "automatically_resolved" &&
        current.severity !== "automatically_resolved")
    ) {
      retained.set(key, normalizedIssue);
    }
  }
  const issues = [...retained.values()];
  const blockingWarnings = issues.filter(
    (issue) => issue.severity === "blocking" && issue.status === "unresolved"
  );
  const needsReviewWarnings = issues.filter((issue) => issue.severity === "needs_review");
  const automaticallyResolvedWarnings = issues.filter(
    (issue) => issue.severity === "automatically_resolved"
  );
  const informationalWarnings = issues.filter(
    (issue) => issue.severity === "informational"
  );
  const unacknowledgedReviewWarnings = needsReviewWarnings.filter(
    (issue) => issue.status === "unresolved"
  );
  const acknowledgedReviewWarnings = needsReviewWarnings.filter(
    (issue) => issue.status !== "unresolved"
  );

  return {
    issues,
    diagnosticCounts: {
      rawWarningCount: importResult.warnings.length + generationWarnings.length,
      normalizedIssueCount: allIssues.length,
      deduplicatedIssueCount: issues.length,
    },
    blockingWarnings,
    needsReviewWarnings,
    automaticallyResolvedWarnings,
    informationalWarnings,
    unacknowledgedReviewWarnings,
    acknowledgedReviewWarnings,
    reviewWarnings: needsReviewWarnings,
    unresolvedReviewWarnings: unacknowledgedReviewWarnings,
    resolvedReviewWarnings: acknowledgedReviewWarnings,
    canCreateCalendar: scheduleNameErrorCount === 0 && blockingWarnings.length === 0,
    needsReviewAcknowledgment: unacknowledgedReviewWarnings.length > 0,
  } satisfies CalendarWarningClassification & {
    issues: ClassifiedCalendarWarning[];
    diagnosticCounts: {
      rawWarningCount: number;
      normalizedIssueCount: number;
      deduplicatedIssueCount: number;
    };
    canCreateCalendar: boolean;
    needsReviewAcknowledgment: boolean;
  };
}

export function getAiCreateCalendarReadiness({
  warnings,
  warningResolutions,
  scheduleNameErrorCount = 0,
}: {
  warnings: ClassifiableCalendarWarning[];
  warningResolutions?: AiImportWarningResolution[];
  scheduleNameErrorCount?: number;
}) {
  const classification = classifyCalendarWarnings(warnings, warningResolutions || []);

  return {
    ...classification,
    canCreateCalendar:
      scheduleNameErrorCount === 0 && classification.blockingWarnings.length === 0,
    needsReviewAcknowledgment: classification.unacknowledgedReviewWarnings.length > 0,
  };
}

export function logCalendarWarningClassification(
  source: string,
  classification: CalendarWarningClassification
) {
  console.info("[AI Quick Setup warning classification]", {
    source,
    issues: [
      ...classification.blockingWarnings,
      ...classification.needsReviewWarnings,
      ...classification.automaticallyResolvedWarnings,
      ...classification.informationalWarnings,
    ].map((issue) => ({
      issueId: issue.issueId,
      issueCode: issue.issueCode,
      createdBy: issue.createdBy,
      affectedDates: issue.affectedDates,
      sourceArray: issue.sourceArray,
      originalSeverity: issue.originalSeverity,
      finalSeverity: issue.finalSeverity,
      finalStatus: issue.finalStatus,
      persistedOrGenerated: issue.persistedOrGenerated,
      analysisVersion: issue.analysisVersion,
    })),
    blocking: classification.blockingWarnings.map((warning) => warning.code),
    needsReview: classification.needsReviewWarnings.map((warning) => ({
      code: warning.code,
      resolved: warning.resolved,
    })),
    automaticallyResolved: classification.automaticallyResolvedWarnings.map(
      (warning) => warning.code
    ),
    informational: classification.informationalWarnings.map((warning) => warning.code),
  });
}

export function inferAiScheduleType(name: string) {
  const value = name.toLowerCase();
  if (value.includes("final")) return "Finals";
  if (value.includes("minimum")) return "Minimum Day";
  if (value.includes("rally")) return "Rally";
  if (value.includes("test")) return "Testing";
  if (value.includes("all-period") || value.includes("all period")) return "All Periods";
  return "Custom";
}

export function containsTemporaryScheduleId(value: string | null | undefined) {
  return Boolean(value && /^(ai-|temp-|mock-|sched-)/i.test(value));
}

export function isUuid(value: string | null | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

export function isNoSchoolLikeDetectedScheduleName(name: string) {
  const normalized = normalizeScheduleNameForMatching(name);
  return [
    "no classes scheduled",
    "no school",
    "holiday",
    "school closed",
    "district closed",
    "recess",
  ].map(normalizeScheduleNameForMatching).some((phrase) => normalized === phrase || normalized.includes(phrase));
}

export function getAiScheduleUsageDetails(
  importResult: AiCalendarImportResult,
  tempId: string
): AiScheduleUsageDetails {
  const usageCounts = getDetectedScheduleUsageCounts(importResult);
  const config = buildAiCalendarConfig(importResult, {});
  const generated = generateSchoolYearCalendar(config);
  const dates = generated.days
    .filter((day) => day.isSchoolDay && day.scheduleId === tempId)
    .map((day) => day.date);
  const patternReferenceCount = importResult.pattern.scheduleTempIds.filter(
    (scheduleTempId) => scheduleTempId === tempId
  ).length;
  const specialDayReferenceCount = importResult.specialDays.filter(
    (day) => day.isInstructional && day.scheduleTempId === tempId
  ).length + (importResult.datedScheduleAssignments || []).filter(
    (assignment) => assignment.scheduleTempId === tempId
  ).length + (importResult.dateClassifications || []).filter(
    (classification) =>
      classification.classification === "instructional" &&
      classification.scheduleTempId === tempId
  ).length;

  return {
    tempId,
    calendarDayCount: usageCounts[tempId] || dates.length,
    dates,
    patternReferenceCount,
    specialDayReferenceCount,
    isReferenced: patternReferenceCount > 0 || specialDayReferenceCount > 0 || dates.length > 0,
  };
}

function replaceScheduleReferences(
  importResult: AiCalendarImportResult,
  tempId: string,
  replacementScheduleId: string
): AiCalendarImportResult {
  return {
    ...importResult,
    detectedSchedules: importResult.detectedSchedules.filter(
      (schedule) => schedule.tempId !== tempId
    ),
    pattern: {
      ...importResult.pattern,
      scheduleTempIds: importResult.pattern.scheduleTempIds.map((scheduleTempId) =>
        scheduleTempId === tempId ? replacementScheduleId : scheduleTempId
      ),
    },
    specialDays: importResult.specialDays.map((day) =>
      day.scheduleTempId === tempId
        ? { ...day, scheduleTempId: replacementScheduleId }
        : day
    ),
    datedScheduleAssignments: importResult.datedScheduleAssignments?.map((assignment) =>
      assignment.scheduleTempId === tempId
        ? { ...assignment, scheduleTempId: replacementScheduleId }
        : assignment
    ),
    dateClassifications: importResult.dateClassifications?.map((classification) =>
      classification.scheduleTempId === tempId
        ? { ...classification, scheduleTempId: replacementScheduleId }
        : classification
    ),
    instructionalDayCountReview: importResult.instructionalDayCountReview
      ? {
          ...importResult.instructionalDayCountReview,
          discrepancyDates: importResult.instructionalDayCountReview.discrepancyDates.map((item) =>
            item.scheduleTempId === tempId
              ? { ...item, scheduleTempId: replacementScheduleId }
              : item
          ),
        }
      : undefined,
  };
}

function removeScheduleReferencesAsNoSchool(
  importResult: AiCalendarImportResult,
  tempId: string,
  name: string,
  affectedDates: string[]
): AiCalendarImportResult | null {
  const nextPatternIds = importResult.pattern.scheduleTempIds.filter(
    (scheduleTempId) => scheduleTempId !== tempId
  );

  if (nextPatternIds.length === 0) return null;

  const convertedSpecialDays = importResult.specialDays.filter(
    (day) => !(day.isInstructional && day.scheduleTempId === tempId)
  );
  const convertedDatedAssignments = (importResult.datedScheduleAssignments || []).filter(
    (assignment) => assignment.scheduleTempId !== tempId
  );
  const specialNoSchoolRanges = importResult.specialDays
    .filter((day) => day.isInstructional && day.scheduleTempId === tempId)
    .map((day) => ({
      id: `ai-removed-${tempId}-${day.id}`,
      startDate: day.startDate,
      endDate: day.endDate,
      label: day.label || name,
      type: "No School",
      confidence: day.confidence,
      evidence: day.evidence,
    }));
  const existingNoSchoolKeys = new Set(
    importResult.noSchoolRanges.map((range) => `${range.startDate}|${range.endDate}|${range.label}`)
  );
  const dateNoSchoolRanges = affectedDates
    .map((date) => ({
      id: `ai-removed-${tempId}-${date}`,
      startDate: date,
      endDate: date,
      label: name,
      type: "No School",
      confidence: "review" as const,
    }))
    .filter((range) => {
      const key = `${range.startDate}|${range.endDate}|${range.label}`;
      if (existingNoSchoolKeys.has(key)) return false;
      existingNoSchoolKeys.add(key);
      return true;
    });
  return {
    ...importResult,
    detectedSchedules: importResult.detectedSchedules.filter(
      (schedule) => schedule.tempId !== tempId
    ),
    pattern: {
      ...importResult.pattern,
      scheduleTempIds: nextPatternIds,
    },
    noSchoolRanges: [
      ...importResult.noSchoolRanges,
      ...specialNoSchoolRanges,
      ...dateNoSchoolRanges,
    ].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    specialDays: convertedSpecialDays,
    datedScheduleAssignments: convertedDatedAssignments,
    dateClassifications: (importResult.dateClassifications || []).map((classification) =>
      classification.scheduleTempId === tempId
        ? {
            ...classification,
            classification: "no_school" as const,
            scheduleTempId: null,
          }
        : classification
    ),
    instructionalDayCountReview: importResult.instructionalDayCountReview
      ? {
          ...importResult.instructionalDayCountReview,
          acknowledged: false,
          finalApprovedInstructionalDayCount: undefined,
          discrepancyDates: importResult.instructionalDayCountReview.discrepancyDates.map((item) =>
            item.scheduleTempId === tempId
              ? {
                  ...item,
                  classification: "no_school" as const,
                  scheduleTempId: null,
                  reviewed: true,
                }
              : item
          ),
        }
      : undefined,
  };
}

export function removeAiDetectedSchedule({
  importResult,
  tempId,
  action,
  removedAt = new Date().toISOString(),
}: {
  importResult: AiCalendarImportResult;
  tempId: string;
  action: AiScheduleRemovalAction;
  removedAt?: string;
}): AiScheduleRemovalResult {
  const schedule = importResult.detectedSchedules.find((item) => item.tempId === tempId);
  if (!schedule) {
    return { success: false, message: "That detected schedule is no longer available." };
  }

  const name = schedule.detectedName;
  const usage = getAiScheduleUsageDetails(importResult, tempId);

  if (action.type === "remove_unused") {
    if (usage.isReferenced) {
      return {
        success: false,
        message: "Choose how Sundial should handle dates that use this schedule.",
      };
    }

    return {
      success: true,
      affectedDayCount: 0,
      importResult: {
        ...importResult,
        detectedSchedules: importResult.detectedSchedules.filter(
          (item) => item.tempId !== tempId
        ),
      },
      removedSchedule: {
        tempId,
        name,
        removedAt,
        action: "removed",
        affectedDayCount: 0,
      },
    };
  }

  if (action.type === "reassign") {
    if (!action.replacementScheduleId || action.replacementScheduleId === tempId) {
      return { success: false, message: "Choose a replacement schedule." };
    }

    return {
      success: true,
      affectedDayCount: usage.calendarDayCount,
      importResult: replaceScheduleReferences(
        importResult,
        tempId,
        action.replacementScheduleId
      ),
      removedSchedule: {
        tempId,
        name,
        removedAt,
        action: "reassigned",
        affectedDayCount: usage.calendarDayCount,
      },
    };
  }

  const nextImportResult = removeScheduleReferencesAsNoSchool(
    importResult,
    tempId,
    name,
    usage.dates
  );

  if (!nextImportResult) {
    return {
      success: false,
      message: "This schedule is the final normal pattern schedule. Reassign it before removing.",
    };
  }

  return {
    success: true,
    affectedDayCount: usage.calendarDayCount,
    importResult: nextImportResult,
    removedSchedule: {
      tempId,
      name,
      removedAt,
      action: "marked_no_school",
      affectedDayCount: usage.calendarDayCount,
    },
  };
}

export function collectReferencedScheduleIds(importResult: AiCalendarImportResult) {
  const ids = new Set(importResult.pattern.scheduleTempIds);
  for (const day of importResult.specialDays) {
    if (day.isInstructional && day.scheduleTempId) ids.add(day.scheduleTempId);
  }
  for (const assignment of importResult.datedScheduleAssignments || []) {
    ids.add(assignment.scheduleTempId);
  }
  for (const classification of importResult.dateClassifications || []) {
    if (classification.classification === "instructional" && classification.scheduleTempId) {
      ids.add(classification.scheduleTempId);
    }
  }
  return [...ids];
}

export function collectReferencedRemovedScheduleIds(
  importResult: AiCalendarImportResult,
  removedSchedules: RemovedAiScheduleRecord[] = []
) {
  const referenced = new Set(collectReferencedScheduleIds(importResult));
  return removedSchedules
    .map((schedule) => schedule.tempId)
    .filter((tempId) => referenced.has(tempId));
}

function reviewedName(resolution: DetectedScheduleResolution) {
  return (resolution.reviewedName || resolution.detectedName || "").trim();
}

export function planAiSchedulePersistence({
  importResult,
  resolutions,
  existingSchedules,
  createId = randomUUID,
}: {
  importResult: AiCalendarImportResult;
  resolutions: DetectedScheduleResolution[];
  existingSchedules: ExistingScheduleForAiPersistence[];
  createId?: () => string;
}): AiScheduleResolutionPlan {
  const resolutionsByTempId = new Map(
    resolutions.map((resolution) => [resolution.tempId, resolution])
  );
  const requiredTempIds = getRequiredDetectedScheduleIds(importResult).filter(
    (scheduleId) => !isUuid(scheduleId) || resolutionsByTempId.has(scheduleId)
  );
  const existingById = new Map(existingSchedules.map((schedule) => [schedule.id, schedule]));
  const existingByNormalized = new Map(
    existingSchedules.map((schedule) => [
      normalizeScheduleNameForMatching(schedule.name),
      schedule,
    ])
  );
  const reviewedNamesByNormalized = new Map<string, string>();
  const tempToScheduleId: Record<string, string> = {};
  const schedulesToCreate: AiScheduleToCreate[] = [];
  const matchedScheduleIds: string[] = [];
  const detectedOrder = new Map(
    importResult.detectedSchedules.map((schedule, index) => [schedule.tempId, index])
  );

  for (const tempId of requiredTempIds) {
    const resolution = resolutionsByTempId.get(tempId);
    if (!resolution || resolution.status === "ignored") {
      return {
        tempToScheduleId,
        schedulesToCreate,
        matchedScheduleIds,
        schedulesNeedingTimes: [],
        conflict: "Some detected schedules could not be created or matched.",
      };
    }

    const name = reviewedName(resolution);
    if (!name || name.length > 80) {
      return {
        tempToScheduleId,
        schedulesToCreate,
        matchedScheduleIds,
        schedulesNeedingTimes: [],
        conflict: "Review every detected schedule name before creating the calendar.",
      };
    }

    const normalized = normalizeScheduleNameForMatching(name);
    const duplicateTempId = reviewedNamesByNormalized.get(normalized);
    if (duplicateTempId && duplicateTempId !== tempId) {
      return {
        tempToScheduleId,
        schedulesToCreate,
        matchedScheduleIds,
        schedulesNeedingTimes: [],
        conflict: "Two detected schedules have the same name. Rename one before creating the calendar.",
      };
    }
    reviewedNamesByNormalized.set(normalized, tempId);

    if (resolution.matchedExistingScheduleId) {
      const existing = existingById.get(resolution.matchedExistingScheduleId);
      if (!existing || existing.active !== true) {
        return {
          tempToScheduleId,
          schedulesToCreate,
          matchedScheduleIds,
          schedulesNeedingTimes: [],
          conflict: "A matched schedule is unavailable. Refresh and review the import again.",
        };
      }
      tempToScheduleId[tempId] = existing.id;
      matchedScheduleIds.push(existing.id);
      continue;
    }

    const existingWithSameName = existingByNormalized.get(normalized);
    if (existingWithSameName) {
      return {
        tempToScheduleId,
        schedulesToCreate,
        matchedScheduleIds,
        schedulesNeedingTimes: [],
        conflict:
          "A schedule with one of these names already exists. Match it before creating the calendar.",
      };
    }

    const id = createId();
    tempToScheduleId[tempId] = id;
    schedulesToCreate.push({
      tempId,
      id,
      scheduleName: name,
      scheduleType: inferAiScheduleType(name),
      calendarColor:
        normalizeHexColor(resolution.calendarColor) ||
        getAiScheduleDefaultColor(detectedOrder.get(tempId) || 0),
      setupStatus: "needs_times",
    });
  }

  return {
    tempToScheduleId,
    schedulesToCreate,
    matchedScheduleIds,
    schedulesNeedingTimes: schedulesToCreate.map((schedule) => ({
      id: schedule.id,
      name: schedule.scheduleName,
    })),
  };
}

function mapTempId(id: string | undefined, mapping: Record<string, string>) {
  if (!id) return "";
  return mapping[id] || id;
}

export function resolveAiScheduleReferences(
  importResult: AiCalendarImportResult,
  tempToScheduleId: Record<string, string>
): CalendarWizardConfig {
  const pattern =
    importResult.pattern.type === "same"
      ? {
          type: "same" as const,
          scheduleId: mapTempId(importResult.pattern.scheduleTempIds[0], tempToScheduleId),
        }
      : importResult.pattern.type === "weekday"
        ? {
            type: "weekday" as const,
            schedulesByWeekday: Object.fromEntries(
              importResult.schoolYear.operatingWeekdays.map((weekday, index) => [
                weekday,
                mapTempId(
                  importResult.pattern.scheduleTempIds[index] ||
                    importResult.pattern.scheduleTempIds[0],
                  tempToScheduleId
                ),
              ])
            ) as Partial<Record<Weekday, string>>,
          }
        : {
            type: "repeating" as const,
            scheduleIds: importResult.pattern.scheduleTempIds.map((tempId) =>
              mapTempId(tempId, tempToScheduleId)
            ),
          };

  return {
    schoolYear: {
      name:
        importResult.schoolYear.label ||
        `${importResult.schoolYear.startDate.slice(0, 4)}-${importResult.schoolYear.endDate.slice(0, 4)}`,
      startDate: importResult.schoolYear.startDate,
      endDate: importResult.schoolYear.endDate,
      calendarCoverageStart:
        importResult.schoolYear.calendarCoverageStart || importResult.schoolYear.startDate,
      calendarCoverageEnd:
        importResult.schoolYear.calendarCoverageEnd || importResult.schoolYear.endDate,
      instructionalStart:
        importResult.schoolYear.instructionalStart || importResult.schoolYear.startDate,
      instructionalEnd:
        importResult.schoolYear.instructionalEnd || importResult.schoolYear.endDate,
    },
    operatingWeekdays: importResult.schoolYear.operatingWeekdays,
    pattern,
    noSchoolRanges: importResult.noSchoolRanges.map((range) => ({
      id: range.id,
      startDate: range.startDate,
      endDate: range.endDate,
      label: range.label,
      type: range.type,
    })),
    specialDays: importResult.specialDays.map((day) => ({
      id: day.id,
      startDate: day.startDate,
      endDate: day.endDate,
      scheduleId: day.isInstructional
        ? mapTempId(day.scheduleTempId, tempToScheduleId) || null
        : null,
      label: day.label,
      isInstructional: day.isInstructional,
      rotationBehavior: day.rotationBehavior || "pause",
      assignmentSource: day.assignmentSource === "administrator"
        ? "administrator"
        : day.assignmentSource === "explicit_text"
          ? "explicit_text"
          : "genuine_special",
    })),
    datedScheduleAssignments: (importResult.datedScheduleAssignments || []).map((assignment) => ({
      id: assignment.id,
      date: assignment.date,
      scheduleId: mapTempId(assignment.scheduleTempId, tempToScheduleId),
      source: assignment.source,
      confidence: assignment.confidence,
      label: assignment.scheduleName,
      rotationBehavior: assignment.rotationBehavior,
    })),
    informationalDates: importResult.informationalDates.map((date) => ({
      id: date.id,
      date: date.date,
      label: date.label,
    })),
    dateClassifications: (importResult.dateClassifications || []).map((classification) => ({
      ...classification,
      scheduleId: classification.scheduleTempId
        ? mapTempId(classification.scheduleTempId, tempToScheduleId)
        : null,
    })),
  };
}

export function buildAiCalendarConfig(
  importResult: AiCalendarImportResult,
  tempToScheduleId: Record<string, string>
): CalendarWizardConfig {
  return resolveAiScheduleReferences(importResult, tempToScheduleId);
}

export function collectUnmappedTemporaryScheduleIds(config: CalendarWizardConfig) {
  const ids = new Set<string>();

  if (config.pattern.type === "same" && containsTemporaryScheduleId(config.pattern.scheduleId)) {
    ids.add(config.pattern.scheduleId);
  }

  if (config.pattern.type === "repeating") {
    for (const scheduleId of config.pattern.scheduleIds) {
      if (containsTemporaryScheduleId(scheduleId)) ids.add(scheduleId);
    }
  }

  if (config.pattern.type === "weekday") {
    for (const scheduleId of Object.values(config.pattern.schedulesByWeekday)) {
      if (containsTemporaryScheduleId(scheduleId)) ids.add(scheduleId);
    }
  }

  for (const specialDay of config.specialDays || []) {
    if (containsTemporaryScheduleId(specialDay.scheduleId)) {
      ids.add(specialDay.scheduleId as string);
    }
  }
  for (const classification of config.dateClassifications || []) {
    if (containsTemporaryScheduleId(classification.scheduleId)) {
      ids.add(classification.scheduleId as string);
    }
  }

  return [...ids];
}

export type AiCalendarRpcRowValidationResult =
  | { success: true }
  | {
      success: false;
      invalidIds: string[];
      fieldErrors: Record<string, string>;
    };

function collectInvalidScheduleId(
  row: Pick<CalendarDayInsertRow, "date" | "schedule_id" | "base_schedule_id">,
  field: "schedule_id" | "base_schedule_id",
  invalidIds: Set<string>,
  fieldErrors: Record<string, string>
) {
  const value = row[field];
  if (value === null) return;
  if (isUuid(value)) return;

  invalidIds.add(value);
  fieldErrors[`${row.date}.${field}`] = `${field} must be a valid schedule UUID.`;
}

export function validateAiCalendarRpcRows(
  rows: Array<Pick<CalendarDayInsertRow, "date" | "schedule_id" | "base_schedule_id">>
): AiCalendarRpcRowValidationResult {
  const invalidIds = new Set<string>();
  const fieldErrors: Record<string, string> = {};

  for (const row of rows) {
    if (!isDateString(row.date)) {
      fieldErrors[`${row.date || "unknown"}.date`] = "Calendar row date must be valid.";
    }
    collectInvalidScheduleId(row, "schedule_id", invalidIds, fieldErrors);
    collectInvalidScheduleId(row, "base_schedule_id", invalidIds, fieldErrors);
  }

  if (invalidIds.size > 0 || Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      invalidIds: [...invalidIds],
      fieldErrors,
    };
  }

  return { success: true };
}

export function blockingAiWarningsResolved(
  importResult: AiCalendarImportResult,
  warningResolutions: AiImportWarningResolution[] = []
) {
  return classifyCalendarWarnings(importResult.warnings, warningResolutions).blockingWarnings
    .length === 0;
}
