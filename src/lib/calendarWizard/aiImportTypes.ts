import { isDateString } from "./dateUtils";
import type { PatternType, Weekday } from "./types";

export type AiImportConfidence = "high" | "review" | "uncertain";

export type AiImportEvidence = {
  sourceText?: string;
  page?: number;
  explanation?: string;
};

export type AiDetectedSchoolYear = {
  label?: string;
  startDate: string;
  endDate: string;
  operatingWeekdays: Weekday[];
  confidence: AiImportConfidence;
  evidence?: AiImportEvidence;
};

export type AiDetectedScheduleCategory =
  | "regular"
  | "rotation"
  | "special"
  | "finals"
  | "minimum"
  | "testing"
  | "unknown";

export type AiDetectedSchedule = {
  tempId: string;
  detectedName: string;
  normalizedName: string;
  category: AiDetectedScheduleCategory;
  confidence: AiImportConfidence;
  evidence?: AiImportEvidence;
  needsSetup: boolean;
};

export type AiDetectedPattern = {
  type: PatternType;
  scheduleTempIds: string[];
  confidence: AiImportConfidence;
  evidence?: AiImportEvidence;
};

export type AiDetectedNoSchoolRange = {
  id: string;
  startDate: string;
  endDate: string;
  label: string;
  type?: string;
  confidence: AiImportConfidence;
  evidence?: AiImportEvidence;
};

export type AiDetectedSpecialDay = {
  id: string;
  startDate: string;
  endDate: string;
  label: string;
  type?: string;
  scheduleTempId?: string;
  isInstructional: boolean;
  confidence: AiImportConfidence;
  evidence?: AiImportEvidence;
};

export type AiDetectedInformationalDate = {
  id: string;
  date: string;
  label: string;
  confidence: AiImportConfidence;
  evidence?: AiImportEvidence;
};

export type AiImportWarning = {
  code: string;
  message: string;
  severity: "info" | "review" | "blocking";
};

export type AiImportWarningResolution = {
  code: string;
  status: "unreviewed" | "accepted_suggestion" | "kept_original" | "edited_manually" | "acknowledged";
  note?: string;
};

export type AiCalendarImportResult = {
  schemaVersion: 1;
  source: "mock" | "openai";
  analyzedAt: string;
  documentTitle?: string | null;
  detectedSchoolName?: string | null;
  expectedInstructionalDayCount?: number | null;
  legendInterpretation?: string | null;
  extractionNotes?: string | null;
  usage?: {
    model?: string;
    requestId?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    durationMs?: number;
  };
  schoolYear: AiDetectedSchoolYear;
  detectedSchedules: AiDetectedSchedule[];
  pattern: AiDetectedPattern;
  noSchoolRanges: AiDetectedNoSchoolRange[];
  specialDays: AiDetectedSpecialDay[];
  informationalDates: AiDetectedInformationalDate[];
  warnings: AiImportWarning[];
};

export type DetectedScheduleResolutionStatus =
  | "matched_automatically"
  | "matched_by_admin"
  | "needs_times"
  /** Legacy session drafts used unresolved before detected schedules were treated as valid concepts. */
  | "unresolved"
  | "ignored";

export type DetectedScheduleResolution = {
  tempId: string;
  detectedName: string;
  reviewedName?: string;
  normalizedName: string;
  matchedExistingScheduleId: string | null;
  status: DetectedScheduleResolutionStatus;
  needsSetup: boolean;
  setupChoice?: "add_now" | "add_later";
};

export type AiImportReviewState =
  | "idle"
  | "file_selected"
  | "uploading"
  | "analyzing"
  | "complete"
  | "complete_with_warnings"
  | "failed"
  | "review"
  | "applied";

export type AiImportDraftMetadata = {
  state: AiImportReviewState;
  fileName?: string;
  result?: AiCalendarImportResult;
  resolutions: DetectedScheduleResolution[];
  appliedAt?: string;
  banner?: string;
  unresolvedRequiredScheduleIds?: string[];
  removedSchedules?: Array<{
    tempId: string;
    name: string;
    removedAt: string;
    action: "removed" | "reassigned" | "marked_no_school";
    affectedDayCount?: number;
  }>;
  warnings?: AiImportWarning[];
  warningResolutions?: AiImportWarningResolution[];
};

export type AiImportValidationResult =
  | { success: true; data: AiCalendarImportResult }
  | { success: false; errors: string[] };

export type AnalyzeCalendarPdfResult =
  | {
      status: "success";
      importResult: AiCalendarImportResult;
    }
  | {
      status:
        | "validation_error"
        | "configuration_error"
        | "rate_limited"
        | "analysis_failed"
        | "permission_error"
        | "server_error";
      message: string;
      retryable?: boolean;
    };

const confidenceValues = new Set<AiImportConfidence>(["high", "review", "uncertain"]);
const patternValues = new Set<PatternType>(["same", "repeating", "weekday"]);

export function confidenceLabel(confidence: AiImportConfidence) {
  if (confidence === "high") return "Confident";
  if (confidence === "review") return "Review Recommended";
  return "Unsure";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function isConfidence(value: unknown): value is AiImportConfidence {
  return typeof value === "string" && confidenceValues.has(value as AiImportConfidence);
}

function assertDate(value: unknown, path: string, errors: string[]) {
  if (typeof value !== "string" || !isDateString(value)) {
    errors.push(`${path} must be a YYYY-MM-DD date.`);
  }
}

function assertString(value: unknown, path: string, errors: string[]) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path} is required.`);
  }
}

function assertConfidence(value: unknown, path: string, errors: string[]) {
  if (!isConfidence(value)) errors.push(`${path} has an unsupported confidence value.`);
}

export function validateAiCalendarImportResult(value: unknown): AiImportValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { success: false, errors: ["Import result must be an object."] };
  }

  if (value.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  if (value.source !== "mock" && value.source !== "openai") {
    errors.push("source must be mock or openai.");
  }
  assertDate(value.analyzedAt, "analyzedAt", errors);
  if (
    value.expectedInstructionalDayCount !== undefined &&
    value.expectedInstructionalDayCount !== null &&
    (typeof value.expectedInstructionalDayCount !== "number" ||
      !Number.isInteger(value.expectedInstructionalDayCount) ||
      value.expectedInstructionalDayCount < 0)
  ) {
    errors.push("expectedInstructionalDayCount must be a positive integer.");
  }

  const schoolYear = value.schoolYear;
  if (!isRecord(schoolYear)) {
    errors.push("schoolYear is required.");
  } else {
    assertDate(schoolYear.startDate, "schoolYear.startDate", errors);
    assertDate(schoolYear.endDate, "schoolYear.endDate", errors);
    if (
      !Array.isArray(schoolYear.operatingWeekdays) ||
      schoolYear.operatingWeekdays.length === 0 ||
      schoolYear.operatingWeekdays.some((weekday) => !isWeekday(weekday))
    ) {
      errors.push("schoolYear.operatingWeekdays must include valid weekdays.");
    }
    assertConfidence(schoolYear.confidence, "schoolYear.confidence", errors);
  }

  if (!Array.isArray(value.detectedSchedules)) {
    errors.push("detectedSchedules must be an array.");
  } else {
    value.detectedSchedules.forEach((schedule, index) => {
      if (!isRecord(schedule)) {
        errors.push(`detectedSchedules.${index} must be an object.`);
        return;
      }
      assertString(schedule.tempId, `detectedSchedules.${index}.tempId`, errors);
      assertString(schedule.detectedName, `detectedSchedules.${index}.detectedName`, errors);
      assertString(schedule.normalizedName, `detectedSchedules.${index}.normalizedName`, errors);
      assertConfidence(schedule.confidence, `detectedSchedules.${index}.confidence`, errors);
      if (typeof schedule.needsSetup !== "boolean") {
        errors.push(`detectedSchedules.${index}.needsSetup must be boolean.`);
      }
    });
  }

  const pattern = value.pattern;
  if (!isRecord(pattern)) {
    errors.push("pattern is required.");
  } else {
    if (typeof pattern.type !== "string" || !patternValues.has(pattern.type as PatternType)) {
      errors.push("pattern.type must be same, repeating, or weekday.");
    }
    if (!Array.isArray(pattern.scheduleTempIds) || pattern.scheduleTempIds.length === 0) {
      errors.push("pattern.scheduleTempIds must include at least one schedule.");
    }
    assertConfidence(pattern.confidence, "pattern.confidence", errors);
  }

  if (!Array.isArray(value.noSchoolRanges)) {
    errors.push("noSchoolRanges must be an array.");
  } else {
    value.noSchoolRanges.forEach((range, index) => {
      if (!isRecord(range)) {
        errors.push(`noSchoolRanges.${index} must be an object.`);
        return;
      }
      assertString(range.id, `noSchoolRanges.${index}.id`, errors);
      assertDate(range.startDate, `noSchoolRanges.${index}.startDate`, errors);
      assertDate(range.endDate, `noSchoolRanges.${index}.endDate`, errors);
      assertString(range.label, `noSchoolRanges.${index}.label`, errors);
      assertConfidence(range.confidence, `noSchoolRanges.${index}.confidence`, errors);
    });
  }

  if (!Array.isArray(value.specialDays)) {
    errors.push("specialDays must be an array.");
  } else {
    value.specialDays.forEach((day, index) => {
      if (!isRecord(day)) {
        errors.push(`specialDays.${index} must be an object.`);
        return;
      }
      assertString(day.id, `specialDays.${index}.id`, errors);
      assertDate(day.startDate, `specialDays.${index}.startDate`, errors);
      assertDate(day.endDate, `specialDays.${index}.endDate`, errors);
      assertString(day.label, `specialDays.${index}.label`, errors);
      if (typeof day.isInstructional !== "boolean") {
        errors.push(`specialDays.${index}.isInstructional must be boolean.`);
      }
      assertConfidence(day.confidence, `specialDays.${index}.confidence`, errors);
    });
  }

  if (!Array.isArray(value.informationalDates)) {
    errors.push("informationalDates must be an array.");
  } else {
    value.informationalDates.forEach((date, index) => {
      if (!isRecord(date)) {
        errors.push(`informationalDates.${index} must be an object.`);
        return;
      }
      assertString(date.id, `informationalDates.${index}.id`, errors);
      assertDate(date.date, `informationalDates.${index}.date`, errors);
      assertString(date.label, `informationalDates.${index}.label`, errors);
      assertConfidence(date.confidence, `informationalDates.${index}.confidence`, errors);
    });
  }

  if (!Array.isArray(value.warnings)) {
    errors.push("warnings must be an array.");
  }

  return errors.length
    ? { success: false, errors }
    : { success: true, data: value as AiCalendarImportResult };
}
