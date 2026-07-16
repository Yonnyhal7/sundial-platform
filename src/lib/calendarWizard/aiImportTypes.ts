import { isDateString } from "./dateUtils";
import type { PatternType, Weekday } from "./types";

export type AiImportConfidence = "high" | "review" | "uncertain";

export type AiImportEvidence = {
  sourceText?: string;
  page?: number;
  explanation?: string;
};

export type AiCalendarPageRole =
  | "student_attendance_calendar"
  | "school_schedule_calendar"
  | "personnel_holidays"
  | "staff_calendar"
  | "informational_appendix"
  | "unrelated";

export type AiCalendarPageClassification = {
  page: number;
  role: AiCalendarPageRole;
  confidence: AiImportConfidence;
  evidence?: AiImportEvidence;
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
  pageClassifications?: AiCalendarPageClassification[];
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
  calendarColor?: string | null;
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
  | { success: false; errors: string[]; validationErrors: AiImportValidationErrorDetail[] };

export type AiImportValidationErrorCode =
  | "required"
  | "invalid_type"
  | "invalid_value"
  | "invalid_date"
  | "too_small";

export type AiImportValidationErrorDetail = {
  path: string;
  code: AiImportValidationErrorCode;
  expected: string;
  received: string;
  required: boolean;
  message: string;
};

export type AnalyzeCalendarPdfResult =
  | {
      status: "success";
      importResult: AiCalendarImportResult;
      outcome?: "successful" | "repaired" | "reviewable";
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
      reasonCode?: string;
    };

export function summarizeAiImportValidationErrors(
  validationErrors: AiImportValidationErrorDetail[]
) {
  return validationErrors.map(({ path, code, expected, received, required }) => ({
    path,
    code,
    expected,
    received,
    required,
  }));
}

export function getAiImportValidationReasonCode(
  validationErrors: AiImportValidationErrorDetail[]
) {
  if (
    validationErrors.some(
      (error) =>
        error.path === "pattern.scheduleTempIds" ||
        error.path.includes("scheduleTempId")
    )
  ) {
    return "missing_required_schedule";
  }

  if (validationErrors.some((error) => error.code === "invalid_date")) {
    return "invalid_date_range";
  }

  if (validationErrors.some((error) => error.path.includes("schedule"))) {
    return "invalid_schedule_reference";
  }

  return "ai_schema_validation_failed";
}

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

function describeReceivedValue(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const type = typeof value;
  if (type === "string") return (value as string).trim() ? "string" : "empty string";
  if (type === "number" || type === "boolean") return type;
  if (type === "object") return "object";
  return type;
}

function pushValidationError(
  errors: string[],
  validationErrors: AiImportValidationErrorDetail[],
  detail: Omit<AiImportValidationErrorDetail, "message" | "required"> & {
    message?: string;
    required?: boolean;
  }
) {
  const message = detail.message || `${detail.path} must be ${detail.expected}.`;
  errors.push(message);
  validationErrors.push({ ...detail, required: detail.required ?? true, message });
}

function assertDate(
  value: unknown,
  path: string,
  errors: string[],
  validationErrors: AiImportValidationErrorDetail[]
) {
  if (typeof value !== "string" || !isDateString(value)) {
    pushValidationError(errors, validationErrors, {
      path,
      code: "invalid_date",
      expected: "YYYY-MM-DD date",
      received: describeReceivedValue(value),
      message: `${path} must be a YYYY-MM-DD date.`,
    });
  }
}

function assertString(
  value: unknown,
  path: string,
  errors: string[],
  validationErrors: AiImportValidationErrorDetail[]
) {
  if (typeof value !== "string" || !value.trim()) {
    pushValidationError(errors, validationErrors, {
      path,
      code: "required",
      expected: "non-empty string",
      received: describeReceivedValue(value),
      message: `${path} is required.`,
    });
  }
}

function assertConfidence(
  value: unknown,
  path: string,
  errors: string[],
  validationErrors: AiImportValidationErrorDetail[]
) {
  if (!isConfidence(value)) {
    pushValidationError(errors, validationErrors, {
      path,
      code: "invalid_value",
      expected: "high, review, or uncertain",
      received: describeReceivedValue(value),
      message: `${path} has an unsupported confidence value.`,
    });
  }
}

export function validateAiCalendarImportResult(value: unknown): AiImportValidationResult {
  const errors: string[] = [];
  const validationErrors: AiImportValidationErrorDetail[] = [];

  if (!isRecord(value)) {
    return {
      success: false,
      errors: ["Import result must be an object."],
      validationErrors: [
        {
          path: "",
          code: "invalid_type",
          expected: "object",
          received: describeReceivedValue(value),
          required: true,
          message: "Import result must be an object.",
        },
      ],
    };
  }

  if (value.schemaVersion !== 1) {
    pushValidationError(errors, validationErrors, {
      path: "schemaVersion",
      code: "invalid_value",
      expected: "1",
      received: describeReceivedValue(value.schemaVersion),
      message: "schemaVersion must be 1.",
    });
  }
  if (value.source !== "mock" && value.source !== "openai") {
    pushValidationError(errors, validationErrors, {
      path: "source",
      code: "invalid_value",
      expected: "mock or openai",
      received: describeReceivedValue(value.source),
      message: "source must be mock or openai.",
    });
  }
  assertDate(value.analyzedAt, "analyzedAt", errors, validationErrors);
  if (
    value.expectedInstructionalDayCount !== undefined &&
    value.expectedInstructionalDayCount !== null &&
    (typeof value.expectedInstructionalDayCount !== "number" ||
      !Number.isInteger(value.expectedInstructionalDayCount) ||
      value.expectedInstructionalDayCount < 0)
  ) {
    pushValidationError(errors, validationErrors, {
      path: "expectedInstructionalDayCount",
      code: "invalid_type",
      expected: "non-negative integer or null",
      received: describeReceivedValue(value.expectedInstructionalDayCount),
      required: false,
      message: "expectedInstructionalDayCount must be a positive integer.",
    });
  }

  const schoolYear = value.schoolYear;
  if (!isRecord(schoolYear)) {
    pushValidationError(errors, validationErrors, {
      path: "schoolYear",
      code: "required",
      expected: "object",
      received: describeReceivedValue(schoolYear),
      message: "schoolYear is required.",
    });
  } else {
    assertDate(schoolYear.startDate, "schoolYear.startDate", errors, validationErrors);
    assertDate(schoolYear.endDate, "schoolYear.endDate", errors, validationErrors);
    if (
      !Array.isArray(schoolYear.operatingWeekdays) ||
      schoolYear.operatingWeekdays.length === 0 ||
      schoolYear.operatingWeekdays.some((weekday) => !isWeekday(weekday))
    ) {
      pushValidationError(errors, validationErrors, {
        path: "schoolYear.operatingWeekdays",
        code: Array.isArray(schoolYear.operatingWeekdays) ? "too_small" : "invalid_type",
        expected: "at least one weekday integer from 0 to 6",
        received: describeReceivedValue(schoolYear.operatingWeekdays),
        message: "schoolYear.operatingWeekdays must include valid weekdays.",
      });
    }
    assertConfidence(schoolYear.confidence, "schoolYear.confidence", errors, validationErrors);
  }

  if (!Array.isArray(value.detectedSchedules)) {
    pushValidationError(errors, validationErrors, {
      path: "detectedSchedules",
      code: "invalid_type",
      expected: "array",
      received: describeReceivedValue(value.detectedSchedules),
      message: "detectedSchedules must be an array.",
    });
  } else {
    value.detectedSchedules.forEach((schedule, index) => {
      if (!isRecord(schedule)) {
        pushValidationError(errors, validationErrors, {
          path: `detectedSchedules.${index}`,
          code: "invalid_type",
          expected: "object",
          received: describeReceivedValue(schedule),
          message: `detectedSchedules.${index} must be an object.`,
        });
        return;
      }
      assertString(schedule.tempId, `detectedSchedules.${index}.tempId`, errors, validationErrors);
      assertString(schedule.detectedName, `detectedSchedules.${index}.detectedName`, errors, validationErrors);
      assertString(schedule.normalizedName, `detectedSchedules.${index}.normalizedName`, errors, validationErrors);
      assertConfidence(schedule.confidence, `detectedSchedules.${index}.confidence`, errors, validationErrors);
      if (typeof schedule.needsSetup !== "boolean") {
        pushValidationError(errors, validationErrors, {
          path: `detectedSchedules.${index}.needsSetup`,
          code: "invalid_type",
          expected: "boolean",
          received: describeReceivedValue(schedule.needsSetup),
          message: `detectedSchedules.${index}.needsSetup must be boolean.`,
        });
      }
    });
  }

  const pattern = value.pattern;
  if (!isRecord(pattern)) {
    pushValidationError(errors, validationErrors, {
      path: "pattern",
      code: "required",
      expected: "object",
      received: describeReceivedValue(pattern),
      message: "pattern is required.",
    });
  } else {
    if (typeof pattern.type !== "string" || !patternValues.has(pattern.type as PatternType)) {
      pushValidationError(errors, validationErrors, {
        path: "pattern.type",
        code: "invalid_value",
        expected: "same, repeating, or weekday",
        received: describeReceivedValue(pattern.type),
        message: "pattern.type must be same, repeating, or weekday.",
      });
    }
    if (!Array.isArray(pattern.scheduleTempIds) || pattern.scheduleTempIds.length === 0) {
      pushValidationError(errors, validationErrors, {
        path: "pattern.scheduleTempIds",
        code: Array.isArray(pattern.scheduleTempIds) ? "too_small" : "invalid_type",
        expected: "at least one schedule temp id",
        received: describeReceivedValue(pattern.scheduleTempIds),
        message: "pattern.scheduleTempIds must include at least one schedule.",
      });
    }
    assertConfidence(pattern.confidence, "pattern.confidence", errors, validationErrors);
  }

  if (!Array.isArray(value.noSchoolRanges)) {
    pushValidationError(errors, validationErrors, {
      path: "noSchoolRanges",
      code: "invalid_type",
      expected: "array",
      received: describeReceivedValue(value.noSchoolRanges),
      message: "noSchoolRanges must be an array.",
    });
  } else {
    value.noSchoolRanges.forEach((range, index) => {
      if (!isRecord(range)) {
        pushValidationError(errors, validationErrors, {
          path: `noSchoolRanges.${index}`,
          code: "invalid_type",
          expected: "object",
          received: describeReceivedValue(range),
          message: `noSchoolRanges.${index} must be an object.`,
        });
        return;
      }
      assertString(range.id, `noSchoolRanges.${index}.id`, errors, validationErrors);
      assertDate(range.startDate, `noSchoolRanges.${index}.startDate`, errors, validationErrors);
      assertDate(range.endDate, `noSchoolRanges.${index}.endDate`, errors, validationErrors);
      assertString(range.label, `noSchoolRanges.${index}.label`, errors, validationErrors);
      assertConfidence(range.confidence, `noSchoolRanges.${index}.confidence`, errors, validationErrors);
    });
  }

  if (!Array.isArray(value.specialDays)) {
    pushValidationError(errors, validationErrors, {
      path: "specialDays",
      code: "invalid_type",
      expected: "array",
      received: describeReceivedValue(value.specialDays),
      message: "specialDays must be an array.",
    });
  } else {
    value.specialDays.forEach((day, index) => {
      if (!isRecord(day)) {
        pushValidationError(errors, validationErrors, {
          path: `specialDays.${index}`,
          code: "invalid_type",
          expected: "object",
          received: describeReceivedValue(day),
          message: `specialDays.${index} must be an object.`,
        });
        return;
      }
      assertString(day.id, `specialDays.${index}.id`, errors, validationErrors);
      assertDate(day.startDate, `specialDays.${index}.startDate`, errors, validationErrors);
      assertDate(day.endDate, `specialDays.${index}.endDate`, errors, validationErrors);
      assertString(day.label, `specialDays.${index}.label`, errors, validationErrors);
      if (typeof day.isInstructional !== "boolean") {
        pushValidationError(errors, validationErrors, {
          path: `specialDays.${index}.isInstructional`,
          code: "invalid_type",
          expected: "boolean",
          received: describeReceivedValue(day.isInstructional),
          message: `specialDays.${index}.isInstructional must be boolean.`,
        });
      }
      assertConfidence(day.confidence, `specialDays.${index}.confidence`, errors, validationErrors);
    });
  }

  if (!Array.isArray(value.informationalDates)) {
    pushValidationError(errors, validationErrors, {
      path: "informationalDates",
      code: "invalid_type",
      expected: "array",
      received: describeReceivedValue(value.informationalDates),
      message: "informationalDates must be an array.",
    });
  } else {
    value.informationalDates.forEach((date, index) => {
      if (!isRecord(date)) {
        pushValidationError(errors, validationErrors, {
          path: `informationalDates.${index}`,
          code: "invalid_type",
          expected: "object",
          received: describeReceivedValue(date),
          message: `informationalDates.${index} must be an object.`,
        });
        return;
      }
      assertString(date.id, `informationalDates.${index}.id`, errors, validationErrors);
      assertDate(date.date, `informationalDates.${index}.date`, errors, validationErrors);
      assertString(date.label, `informationalDates.${index}.label`, errors, validationErrors);
      assertConfidence(date.confidence, `informationalDates.${index}.confidence`, errors, validationErrors);
    });
  }

  if (!Array.isArray(value.warnings)) {
    pushValidationError(errors, validationErrors, {
      path: "warnings",
      code: "invalid_type",
      expected: "array",
      received: describeReceivedValue(value.warnings),
      message: "warnings must be an array.",
    });
  }

  return errors.length
    ? { success: false, errors, validationErrors }
    : { success: true, data: value as AiCalendarImportResult };
}
