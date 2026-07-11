import { randomUUID } from "node:crypto";
import {
  getDetectedScheduleUsageCounts,
  getRequiredDetectedScheduleIds,
} from "./aiImportConversion";
import { isDateString } from "./dateUtils";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import type {
  AiCalendarImportResult,
  AiImportWarning,
  AiImportWarningResolution,
  DetectedScheduleResolution,
} from "./aiImportTypes";
import { normalizeScheduleNameForMatching } from "./aiScheduleMatching";
import type { CalendarDayInsertRow } from "./persistence";
import type {
  CalendarGenerationWarning,
  CalendarGenerationWarningCode,
  CalendarWizardConfig,
  Weekday,
} from "./types";

export type ExistingScheduleForAiPersistence = {
  id: string;
  name: string;
  active: boolean | null;
  setupStatus?: string | null;
};

export type AiScheduleToCreate = {
  tempId: string;
  id: string;
  scheduleName: string;
  scheduleType: string | null;
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
  | AiImportWarning
  | (CalendarGenerationWarning & { severity?: AiImportWarning["severity"] });

export type CalendarWarningClassificationKind = "blocking" | "review" | "informational";

export type ClassifiedCalendarWarning = ClassifiableCalendarWarning & {
  classification: CalendarWarningClassificationKind;
  resolved: boolean;
};

export type CalendarWarningClassification = {
  blockingWarnings: ClassifiedCalendarWarning[];
  reviewWarnings: ClassifiedCalendarWarning[];
  informationalWarnings: ClassifiedCalendarWarning[];
  unresolvedReviewWarnings: ClassifiedCalendarWarning[];
  resolvedReviewWarnings: ClassifiedCalendarWarning[];
};

const blockingGeneratorWarningCodes = new Set<CalendarGenerationWarningCode>([
  "start_date_after_end_date",
  "no_operating_weekdays",
  "overlapping_no_school_ranges",
  "overlapping_special_days",
  "special_day_overlaps_no_school",
  "instructional_day_missing_schedule",
  "weekday_pattern_missing_schedule",
  "repeating_pattern_missing_schedules",
  "duplicate_special_day",
]);

const reviewOnlyWarningCodes = new Set([
  "duplicate_import_item_removed",
  "instructional_day_count_mismatch",
  "schedule_resolution_required",
  "special_day_outside_school_year",
  "unknown_pattern_schedule_reference",
  "unknown_special_day_schedule_reference",
]);

const informationalWarningCodes = new Set([
  "mock_analyzer",
  "needs_times",
  "schedule_needs_times",
  "missing_bell_times",
  "bell_times_needed",
]);

function resolutionIsComplete(resolution: AiImportWarningResolution | undefined) {
  return Boolean(resolution && resolution.status !== "unreviewed");
}

function classifyWarningKind(
  warning: ClassifiableCalendarWarning
): CalendarWarningClassificationKind {
  const code = String(warning.code || "");
  const message = warning.message.toLowerCase();

  if (
    informationalWarningCodes.has(code) ||
    code.includes("needs_times") ||
    code.includes("bell_times") ||
    message.includes("bell times")
  ) {
    return "informational";
  }

  if (
    reviewOnlyWarningCodes.has(code) ||
    message.includes("source-document date typo") ||
    message.includes("source document date typo") ||
    (message.includes("april 30") && message.includes("2026") && message.includes("2027")) ||
    message.includes("confidence") ||
    message.includes("uncertain")
  ) {
    return "review";
  }

  if ("severity" in warning) {
    if (warning.severity === "info") return "informational";
    if (warning.severity === "review") return "review";
    if (warning.severity === "blocking") return "blocking";
  }

  if (blockingGeneratorWarningCodes.has(warning.code as CalendarGenerationWarningCode)) {
    return "blocking";
  }

  return "review";
}

export function classifyCalendarWarnings(
  warnings: ClassifiableCalendarWarning[] = [],
  warningResolutions: AiImportWarningResolution[] = []
): CalendarWarningClassification {
  const resolutionsByCode = new Map(
    warningResolutions.map((resolution) => [resolution.code, resolution])
  );
  const blockingWarnings: ClassifiedCalendarWarning[] = [];
  const reviewWarnings: ClassifiedCalendarWarning[] = [];
  const informationalWarnings: ClassifiedCalendarWarning[] = [];

  for (const warning of warnings) {
    const classification = classifyWarningKind(warning);
    const resolved = resolutionIsComplete(resolutionsByCode.get(warning.code));
    const classified = { ...warning, classification, resolved };

    if (classification === "blocking") {
      blockingWarnings.push(classified);
    } else if (classification === "review") {
      reviewWarnings.push(classified);
    } else {
      informationalWarnings.push(classified);
    }
  }

  return {
    blockingWarnings,
    reviewWarnings,
    informationalWarnings,
    unresolvedReviewWarnings: reviewWarnings.filter((warning) => !warning.resolved),
    resolvedReviewWarnings: reviewWarnings.filter((warning) => warning.resolved),
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
    needsReviewAcknowledgment: classification.unresolvedReviewWarnings.length > 0,
  };
}

export function logCalendarWarningClassification(
  source: string,
  classification: CalendarWarningClassification
) {
  if (process.env.NODE_ENV === "production") return;

  console.info("[AI Quick Setup warning classification]", {
    source,
    blocking: classification.blockingWarnings.map((warning) => warning.code),
    review: classification.reviewWarnings.map((warning) => ({
      code: warning.code,
      resolved: warning.resolved,
    })),
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
  ].some((phrase) => normalized === phrase || normalized.includes(phrase));
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
  const affectedDayCount = new Set(affectedDates).size;

  return {
    ...importResult,
    expectedInstructionalDayCount:
      typeof importResult.expectedInstructionalDayCount === "number"
        ? Math.max(0, importResult.expectedInstructionalDayCount - affectedDayCount)
        : importResult.expectedInstructionalDayCount,
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
      rotationBehavior: "advance",
    })),
    informationalDates: importResult.informationalDates.map((date) => ({
      id: date.id,
      date: date.date,
      label: date.label,
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
