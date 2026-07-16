"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScheduleColorField } from "@/components/admin/ScheduleColorField";
import {
  getAiImportLongRunningMessage,
  getAiImportProgressAfterRetry,
  getAiImportProgressAfterSuccess,
  getAiImportStageForProgress,
  getEstimatedAiImportProgress,
} from "@/lib/calendarWizard/aiImportProgress";
import {
  createAiImportClientTimeoutController,
  mapAiImportClientError,
  parseAiImportResponse,
} from "@/lib/calendarWizard/aiImportClient";
import {
  clearAiImportMetadata,
  convertAiImportToWizardDraft,
  getAiImportReadinessSummary,
  getDetectedScheduleUsageCounts,
  getRequiredDetectedScheduleIds,
  unresolvedRequiredSchedulesBlockFinalReadiness,
} from "@/lib/calendarWizard/aiImportConversion";
import {
  chooseCalendarWizardDraftSource,
  getDraftTypeForCalendarWizardFlow,
  serializeCalendarWizardDraft,
  type CalendarWizardFlowType,
  type CalendarWizardDraftRecord,
  type CalendarWizardStoredData,
} from "@/lib/calendarWizard/draftPersistence";
import {
  appendCalendarWizardLaunchContext,
  type CalendarWizardLaunchContext,
} from "@/lib/calendarWizard/launchContext";
import {
  classifyCalendarWarnings,
  getAiScheduleUsageDetails,
  getAiCreateCalendarReadiness,
  isNoSchoolLikeDetectedScheduleName,
  removeAiDetectedSchedule,
  type AiScheduleRemovalAction,
  type AiScheduleUsageDetails,
} from "@/lib/calendarWizard/aiQuickSetupPersistence";
import {
  confidenceLabel,
  getAiImportValidationReasonCode,
  summarizeAiImportValidationErrors,
  type AnalyzeCalendarPdfResult,
  type AiCalendarImportResult,
  type AiImportDraftMetadata,
  type AiImportReviewState,
  type AiImportWarningResolution,
  type DetectedScheduleResolution,
  validateAiCalendarImportResult,
} from "@/lib/calendarWizard/aiImportTypes";
import {
  matchDetectedSchedules,
  normalizeScheduleNameForMatching,
} from "@/lib/calendarWizard/aiScheduleMatching";
import {
  compareDateStrings,
  eachDateInRange,
  getWeekday,
  isDateString,
  parseDateString,
} from "@/lib/calendarWizard/dateUtils";
import { generateSchoolYearCalendar } from "@/lib/calendarWizard/generateSchoolYearCalendar";
import type {
  CalendarGenerationResult,
  CalendarGenerationWarning,
  CalendarWizardConfig,
  GeneratedCalendarDay,
  NoSchoolRange,
  RotationBehavior,
  SpecialSchoolDay,
  Weekday,
} from "@/lib/calendarWizard/types";
import { sundialPrimaryButtonClass } from "@/lib/ui/buttonStyles";
import { getScheduleCalendarColor, getScheduleDotStyle } from "@/lib/scheduleColors";
import {
  createAiCalendarFromDraftAction,
  generateCalendarAction,
  deleteCalendarWizardDraft,
  saveCalendarWizardDraft,
  type CalendarCompletionSummary,
  type CalendarWizardDraftActionResult,
  type GenerateCalendarActionResult,
} from "./actions";

export type WizardScheduleSummary = {
  id: string;
  name: string;
  type: string | null;
  calendarColor: string | null;
  active: boolean;
  setupStatus: "ready" | "needs_times";
  periodCount: number;
  firstStartTime: string | null;
  lastEndTime: string | null;
};

export type ExistingCalendarRangeSummary = {
  firstDate: string | null;
  lastDate: string | null;
};

type WizardStep = "school-year" | "normal-schedule" | "no-school" | "special-days" | "review";
type AiImportProcessingPhase =
  | "normalization"
  | "schema_validation"
  | "review_generation"
  | "draft_persistence"
  | "consistency_checks";
type AiImportProcessingReasonCode =
  | "schema_validation_failed"
  | "normalization_failed"
  | "draft_save_failed"
  | "review_generation_failed"
  | "calendar_validation_failed";
type PatternMode = "same" | "repeating" | "weekday";
type NoSchoolType =
  | "Holiday"
  | "School Break"
  | "Teacher Work Day"
  | "Inservice Day"
  | "District Closed"
  | "No School"
  | "Custom";
type SpecialDayType =
  | "First Day"
  | "Rally"
  | "Finals"
  | "Testing"
  | "Minimum Day"
  | "All Periods"
  | "Early Release"
  | "School Event"
  | "Custom";

type WizardDraft = {
  schoolYear: {
    label: string;
    startDate: string;
    endDate: string;
    operatingWeekdays: Weekday[];
  };
  patternMode: PatternMode;
  sameScheduleId: string;
  repeatingScheduleIds: string[];
  weekdaySchedules: Partial<Record<Weekday, string>>;
  noSchoolRanges: Array<Omit<NoSchoolRange, "endDate" | "type"> & {
    endDate: string;
    type: NoSchoolType;
  }>;
  specialDays: Array<
    Omit<SpecialSchoolDay, "endDate"> & {
      endDate: string;
      type: SpecialDayType;
      isInstructional: boolean;
      rotationBehavior: RotationBehavior;
    }
  >;
  informationalDates: Array<{ id: string; date: string; label: string }>;
  completedSteps: WizardStep[];
  aiImport?: AiImportDraftMetadata | null;
};

type StepErrors = Record<string, string>;
type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
type LocalStoredDraft = {
  data: CalendarWizardStoredData;
  updatedAt: string;
};

const WIZARD_STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: "school-year", label: "School Year" },
  { id: "normal-schedule", label: "Normal Schedule" },
  { id: "no-school", label: "No-School Days" },
  { id: "special-days", label: "Special Days" },
  { id: "review", label: "Review" },
];

const WEEKDAYS: Array<{ value: Weekday; label: string; short: string }> = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

const NO_SCHOOL_TYPES: NoSchoolType[] = [
  "Holiday",
  "School Break",
  "Teacher Work Day",
  "Inservice Day",
  "District Closed",
  "No School",
  "Custom",
];

const SPECIAL_DAY_TYPES: SpecialDayType[] = [
  "First Day",
  "Rally",
  "Finals",
  "Testing",
  "Minimum Day",
  "All Periods",
  "Early Release",
  "School Event",
  "Custom",
];

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[#D4A017] focus:ring-2 focus:ring-[#D4A017]/25 dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white dark:focus:ring-[#D4A017]/35";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10";
const subtleButtonClass =
  "rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10";
const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

function createDefaultDraft(schedules: WizardScheduleSummary[]): WizardDraft {
  const firstScheduleId = schedules[0]?.id || "";
  return {
    schoolYear: {
      label: "",
      startDate: "",
      endDate: "",
      operatingWeekdays: [1, 2, 3, 4, 5],
    },
    patternMode: "same",
    sameScheduleId: firstScheduleId,
    repeatingScheduleIds: schedules.slice(0, 2).map((schedule) => schedule.id),
    weekdaySchedules: {
      1: firstScheduleId,
      2: firstScheduleId,
      3: firstScheduleId,
      4: firstScheduleId,
      5: firstScheduleId,
    },
    noSchoolRanges: [],
    specialDays: [],
    informationalDates: [],
    completedSteps: [],
    aiImport: null,
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDateForDisplay(date: string) {
  if (!isDateString(date)) return date || "Not selected";
  return parseDateString(date).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(startDate: string, endDate?: string) {
  if (!endDate || endDate === startDate) return formatDateForDisplay(startDate);
  return `${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}`;
}

function normalizeDraftRangeEnd<T extends { startDate: string; endDate?: string | null }>(
  range: T
) {
  return {
    ...range,
    endDate: range.endDate || range.startDate,
  };
}

function detectedScheduleStatusLabel(resolution: DetectedScheduleResolution) {
  if (resolution.status === "matched_automatically" || resolution.status === "matched_by_admin") {
    return "Matched existing schedule";
  }
  if (resolution.status === "ignored") return "Ignored by admin";
  return "New schedule · Bell times needed";
}

function reviewedScheduleName(resolution: DetectedScheduleResolution) {
  return (resolution.reviewedName || resolution.detectedName || "").trim();
}

function getScheduleNameValidation(
  resolution: DetectedScheduleResolution,
  resolutions: DetectedScheduleResolution[],
  schedules: WizardScheduleSummary[]
) {
  const name = reviewedScheduleName(resolution);
  if (!name) return { error: "Enter a schedule name.", warning: "" };
  if (name.length > 80) return { error: "Use 80 characters or fewer.", warning: "" };

  const normalized = normalizeScheduleNameForMatching(name);
  const duplicateInImport = resolutions.some(
    (other) =>
      other.tempId !== resolution.tempId &&
      normalizeScheduleNameForMatching(reviewedScheduleName(other)) === normalized
  );
  if (duplicateInImport) {
    return {
      error: "This name duplicates another detected schedule. Rename one before continuing.",
      warning: "",
    };
  }

  const duplicateExisting = schedules.some(
    (schedule) =>
      schedule.id !== resolution.matchedExistingScheduleId &&
      normalizeScheduleNameForMatching(schedule.name) === normalized
  );

  return {
    error: "",
    warning: duplicateExisting
      ? "A school schedule already has a similar name. Match it above or rename this schedule."
      : "",
  };
}

function createDefaultWarningResolutions(
  warnings: AiCalendarImportResult["warnings"]
): AiImportWarningResolution[] {
  return warnings.map((warning) => ({
    code: warning.code,
    status: "unreviewed",
  }));
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function aiImportReasonCodeForPhase(
  phase: AiImportProcessingPhase
): AiImportProcessingReasonCode {
  if (phase === "schema_validation") return "schema_validation_failed";
  if (phase === "normalization") return "normalization_failed";
  if (phase === "draft_persistence") return "draft_save_failed";
  if (phase === "review_generation") return "review_generation_failed";
  return "calendar_validation_failed";
}

function buildAiImportProcessingFailure(
  phase: AiImportProcessingPhase,
  error: unknown,
  requestId: string | null
): Exclude<AnalyzeCalendarPdfResult, { status: "success" }> {
  const reasonCode = aiImportReasonCodeForPhase(phase);
  console.error("AI calendar import review processing error", {
    phase,
    reasonCode,
    exceptionName: error instanceof Error ? error.name : "unknown",
    exceptionMessage: error instanceof Error ? error.message : undefined,
    stack: error instanceof Error ? error.stack : undefined,
    requestId: requestId || undefined,
  });

  return {
    status: "server_error",
    message:
      "Sundial read the PDF, but could not prepare the calendar review. Please try again or continue manually.",
    retryable: true,
    reasonCode,
  };
}

function formatTime(time: string | null) {
  if (!time) return null;
  return new Date(`2000-01-01T${time}`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function suggestSchoolYearLabel(startDate: string, endDate: string) {
  if (!isDateString(startDate) || !isDateString(endDate)) return "";
  const startYear = parseDateString(startDate).getUTCFullYear();
  const endYear = parseDateString(endDate).getUTCFullYear();
  return startYear === endYear ? String(startYear) : `${startYear}-${endYear}`;
}

function getPossibleOperatingDays(draft: WizardDraft) {
  const { startDate, endDate, operatingWeekdays } = draft.schoolYear;
  if (!isDateString(startDate) || !isDateString(endDate)) return 0;
  if (compareDateStrings(startDate, endDate) > 0) return 0;
  const weekdays = new Set(operatingWeekdays);
  return eachDateInRange(startDate, endDate).filter((date) =>
    weekdays.has(getWeekday(date))
  ).length;
}

function getNoSchoolAffectedOperatingDays(draft: WizardDraft) {
  const { startDate, endDate, operatingWeekdays } = draft.schoolYear;
  if (!isDateString(startDate) || !isDateString(endDate)) return 0;
  const weekdays = new Set(operatingWeekdays);
  const affectedDates = new Set<string>();

  for (const range of draft.noSchoolRanges) {
    if (!isDateString(range.startDate)) continue;
    const rangeEnd = isDateString(range.endDate || "") ? range.endDate! : range.startDate;
    if (compareDateStrings(range.startDate, rangeEnd) > 0) continue;
    for (const date of eachDateInRange(range.startDate, rangeEnd)) {
      if (
        compareDateStrings(date, startDate) >= 0 &&
        compareDateStrings(date, endDate) <= 0 &&
        weekdays.has(getWeekday(date))
      ) {
        affectedDates.add(date);
      }
    }
  }

  return affectedDates.size;
}

function isMeaningfulDraft(draft: WizardDraft) {
  return Boolean(
    draft.schoolYear.label ||
      draft.schoolYear.startDate ||
      draft.schoolYear.endDate ||
      draft.noSchoolRanges.length ||
      draft.specialDays.length ||
      draft.informationalDates.length ||
      draft.completedSteps.length ||
      Boolean(draft.aiImport?.result)
  );
}

function buildStoredDraft(draft: WizardDraft, currentStep: WizardStep): CalendarWizardStoredData {
  return {
    version: 1,
    currentStep,
    draft,
    savedAt: new Date().toISOString(),
  };
}

function parseLocalStoredDraft(value: string | null): LocalStoredDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    const wrapper =
      parsed &&
      typeof parsed === "object" &&
      "data" in parsed &&
      "updatedAt" in parsed
        ? (parsed as { data: unknown; updatedAt?: unknown })
        : { data: parsed, updatedAt: null };
    const serialized = serializeCalendarWizardDraft(wrapper.data);
    if (!serialized) return null;
    return {
      data: serialized.data,
      updatedAt:
        typeof wrapper.updatedAt === "string"
          ? wrapper.updatedAt
          : serialized.data.savedAt,
    };
  } catch {
    return null;
  }
}

function saveLocalStoredDraft(
  storageKey: string,
  data: CalendarWizardStoredData,
  updatedAt: string
) {
  window.sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      data,
      updatedAt,
    } satisfies LocalStoredDraft)
  );
}

function hasMeaningfulManualProgress(draft: WizardDraft) {
  return Boolean(
    draft.schoolYear.label ||
      draft.schoolYear.startDate ||
      draft.schoolYear.endDate ||
      draft.noSchoolRanges.length ||
      draft.specialDays.length ||
      draft.informationalDates.length ||
      draft.completedSteps.length
  );
}

function sanitizeRestoredDraft(value: unknown, schedules: WizardScheduleSummary[]) {
  if (!value || typeof value !== "object") return null;
  const fallback = createDefaultDraft(schedules);
  const record = value as Partial<WizardDraft>;

  return {
    ...fallback,
    ...record,
    schoolYear: {
      ...fallback.schoolYear,
      ...(record.schoolYear || {}),
      operatingWeekdays: Array.isArray(record.schoolYear?.operatingWeekdays)
        ? record.schoolYear.operatingWeekdays.filter((day): day is Weekday =>
            WEEKDAYS.some((weekday) => weekday.value === day)
          )
        : fallback.schoolYear.operatingWeekdays,
    },
    completedSteps: Array.isArray(record.completedSteps)
      ? record.completedSteps.filter((step): step is WizardStep =>
          WIZARD_STEPS.some((wizardStep) => wizardStep.id === step)
        )
      : [],
    noSchoolRanges: Array.isArray(record.noSchoolRanges)
      ? record.noSchoolRanges.map(normalizeDraftRangeEnd)
      : [],
    specialDays: Array.isArray(record.specialDays)
      ? record.specialDays.map(normalizeDraftRangeEnd)
      : [],
    informationalDates: Array.isArray(record.informationalDates)
      ? record.informationalDates
      : [],
    aiImport:
      record.aiImport && typeof record.aiImport === "object"
        ? {
            state: isAiImportReviewState(record.aiImport.state)
              ? record.aiImport.state
              : "idle",
            fileName:
              typeof record.aiImport.fileName === "string"
                ? record.aiImport.fileName
                : undefined,
            result:
              record.aiImport.result && typeof record.aiImport.result === "object"
                ? {
                    ...record.aiImport.result,
                    noSchoolRanges: Array.isArray(record.aiImport.result.noSchoolRanges)
                      ? record.aiImport.result.noSchoolRanges.map(normalizeDraftRangeEnd)
                      : [],
                    specialDays: Array.isArray(record.aiImport.result.specialDays)
                      ? record.aiImport.result.specialDays.map(normalizeDraftRangeEnd)
                      : [],
                  }
                : record.aiImport.result,
            resolutions: Array.isArray(record.aiImport.resolutions)
              ? record.aiImport.resolutions
              : [],
            appliedAt:
              typeof record.aiImport.appliedAt === "string"
                ? record.aiImport.appliedAt
                : undefined,
            banner:
              typeof record.aiImport.banner === "string"
                ? record.aiImport.banner
                : undefined,
            unresolvedRequiredScheduleIds: Array.isArray(
              record.aiImport.unresolvedRequiredScheduleIds
            )
              ? record.aiImport.unresolvedRequiredScheduleIds.filter(
                  (id): id is string => typeof id === "string"
                )
              : [],
            warnings: Array.isArray(record.aiImport.warnings)
              ? record.aiImport.warnings
              : [],
            warningResolutions: Array.isArray(record.aiImport.warningResolutions)
              ? record.aiImport.warningResolutions
              : [],
          }
        : null,
  } satisfies WizardDraft;
}

function isAiImportReviewState(value: unknown): value is AiImportReviewState {
  return (
    typeof value === "string" &&
    [
      "idle",
      "file_selected",
      "uploading",
      "analyzing",
      "complete",
      "complete_with_warnings",
      "failed",
      "review",
      "applied",
    ].includes(value)
  );
}

function buildConfig(draft: WizardDraft): CalendarWizardConfig | null {
  if (unresolvedRequiredSchedulesBlockFinalReadiness(draft)) {
    return null;
  }

  const { schoolYear } = draft;
  if (!isDateString(schoolYear.startDate) || !isDateString(schoolYear.endDate)) {
    return null;
  }

  const base = {
    schoolYear: {
      name: schoolYear.label,
      startDate: schoolYear.startDate,
      endDate: schoolYear.endDate,
    },
    operatingWeekdays: schoolYear.operatingWeekdays,
    noSchoolRanges: draft.noSchoolRanges,
    specialDays: draft.specialDays,
    informationalDates: draft.informationalDates,
  };

  if (draft.patternMode === "same") {
    return {
      ...base,
      pattern: {
        type: "same",
        scheduleId: draft.sameScheduleId,
      },
    };
  }

  if (draft.patternMode === "weekday") {
    return {
      ...base,
      pattern: {
        type: "weekday",
        schedulesByWeekday: draft.weekdaySchedules,
      },
    };
  }

  return {
    ...base,
    pattern: {
      type: "repeating",
      scheduleIds: draft.repeatingScheduleIds.filter(Boolean),
    },
  };
}

function validateStep(step: WizardStep, draft: WizardDraft, schedules: WizardScheduleSummary[]) {
  const errors: StepErrors = {};

  if (step === "school-year") {
    if (!draft.schoolYear.label.trim()) errors.label = "Enter a school year label.";
    if (!isDateString(draft.schoolYear.startDate)) {
      errors.startDate = "Choose the first instructional date.";
    }
    if (!isDateString(draft.schoolYear.endDate)) {
      errors.endDate = "Choose the last instructional date.";
    }
    if (
      isDateString(draft.schoolYear.startDate) &&
      isDateString(draft.schoolYear.endDate) &&
      compareDateStrings(draft.schoolYear.startDate, draft.schoolYear.endDate) > 0
    ) {
      errors.endDate = "Last instructional date must come after the first date.";
    }
    if (draft.schoolYear.operatingWeekdays.length === 0) {
      errors.operatingWeekdays = "Select at least one operating weekday.";
    }
  }

  if (step === "normal-schedule") {
    if (draft.aiImport?.unresolvedRequiredScheduleIds?.length) {
      errors.schedules =
        "Add bell times for the detected schedules before generating your calendar.";
    }
    if (schedules.length === 0) {
      errors.schedules = "Create at least one active schedule before continuing.";
    } else if (draft.patternMode === "same" && !draft.sameScheduleId) {
      errors.sameScheduleId = "Choose a schedule.";
    } else if (draft.patternMode === "repeating") {
      const chosen = draft.repeatingScheduleIds.filter(Boolean);
      if (chosen.length < 2) {
        errors.repeatingScheduleIds = "Choose at least two schedules for a repeating pattern.";
      }
    } else {
      for (const weekday of draft.schoolYear.operatingWeekdays) {
        if (!draft.weekdaySchedules[weekday]) {
          errors[`weekday-${weekday}`] = `Choose a schedule for ${
            WEEKDAYS.find((day) => day.value === weekday)?.label
          }.`;
        }
      }
    }
  }

  if (step === "no-school") {
    draft.noSchoolRanges.forEach((range, index) => {
      if (!isDateString(range.startDate)) {
        errors[`noSchool-${range.id}-start`] = "Choose a start date.";
      }
      if ((range.endDate || "") && !isDateString(range.endDate || "")) {
        errors[`noSchool-${range.id}-end`] = "Choose a valid end date.";
      }
      const endDate = range.endDate || range.startDate;
      if (
        isDateString(range.startDate) &&
        isDateString(endDate) &&
        compareDateStrings(range.startDate, endDate) > 0
      ) {
        errors[`noSchool-${range.id}-end`] = "End date cannot be before start date.";
      }
      if (!range.label.trim()) {
        errors[`noSchool-${range.id}-label`] = "Add a label.";
      }

      for (const otherRange of draft.noSchoolRanges.slice(index + 1)) {
        const otherEnd = otherRange.endDate || otherRange.startDate;
        if (
          isDateString(range.startDate) &&
          isDateString(endDate) &&
          isDateString(otherRange.startDate) &&
          isDateString(otherEnd) &&
          compareDateStrings(range.startDate, otherEnd) <= 0 &&
          compareDateStrings(otherRange.startDate, endDate) <= 0
        ) {
          errors[`noSchool-${range.id}-overlap`] = "This range overlaps another no-school entry.";
        }
      }
    });
  }

  if (step === "special-days") {
    draft.specialDays.forEach((specialDay, index) => {
      if (!isDateString(specialDay.startDate)) {
        errors[`special-${specialDay.id}-start`] = "Choose a start date.";
      }
      if ((specialDay.endDate || "") && !isDateString(specialDay.endDate || "")) {
        errors[`special-${specialDay.id}-end`] = "Choose a valid end date.";
      }
      const endDate = specialDay.endDate || specialDay.startDate;
      if (
        isDateString(specialDay.startDate) &&
        isDateString(endDate) &&
        compareDateStrings(specialDay.startDate, endDate) > 0
      ) {
        errors[`special-${specialDay.id}-end`] = "End date cannot be before start date.";
      }
      if (specialDay.isInstructional && !specialDay.scheduleId) {
        errors[`special-${specialDay.id}-schedule`] = "Choose the schedule used on this special day.";
      }
      if (!specialDay.label.trim()) {
        errors[`special-${specialDay.id}-label`] = "Add a display label.";
      }

      for (const otherSpecialDay of draft.specialDays.slice(index + 1)) {
        const otherEnd = otherSpecialDay.endDate || otherSpecialDay.startDate;
        if (
          isDateString(specialDay.startDate) &&
          isDateString(endDate) &&
          isDateString(otherSpecialDay.startDate) &&
          isDateString(otherEnd) &&
          compareDateStrings(specialDay.startDate, otherEnd) <= 0 &&
          compareDateStrings(otherSpecialDay.startDate, endDate) <= 0
        ) {
          errors[`special-${specialDay.id}-overlap`] = "This special day overlaps another special entry.";
        }
      }
    });

    draft.informationalDates.forEach((info) => {
      if (!isDateString(info.date)) {
        errors[`info-${info.id}-date`] = "Choose a date.";
      }
      if (!info.label.trim()) {
        errors[`info-${info.id}-label`] = "Add a label.";
      }
    });
  }

  if (step === "review") {
    if (draft.aiImport?.unresolvedRequiredScheduleIds?.length) {
      errors.review =
        "Add bell times for detected schedules from the AI import before reviewing the calendar.";
      return errors;
    }

    for (const priorStep of WIZARD_STEPS.slice(0, 4)) {
      const priorErrors = validateStep(priorStep.id, draft, schedules);
      if (Object.keys(priorErrors).length > 0) {
        errors.review = "Complete the previous steps before reviewing the calendar.";
        break;
      }
    }
  }

  return errors;
}

function ErrorText({ id, children }: { id?: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-2 text-sm font-semibold text-red-600 dark:text-red-300">
      {children}
    </p>
  );
}

function ScheduleSelector({
  id,
  value,
  schedules,
  onChange,
  describedBy,
}: {
  id?: string;
  value: string;
  schedules: WizardScheduleSummary[];
  onChange: (value: string) => void;
  describedBy?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
      aria-describedby={describedBy}
    >
      <option value="">Choose schedule</option>
      {schedules.map((schedule) => (
        <option key={schedule.id} value={schedule.id}>
          {schedule.name}
          {schedule.type ? ` (${schedule.type})` : ""}
        </option>
      ))}
    </select>
  );
}

function ScheduleSummaryText({ schedule }: { schedule?: WizardScheduleSummary }) {
  if (!schedule) return null;
  const color = getScheduleCalendarColor({
    id: schedule.id,
    name: schedule.name,
    calendarColor: schedule.calendarColor,
  });
  const swatch = (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
      style={getScheduleDotStyle(color)}
      aria-hidden="true"
    />
  );
  if (schedule.setupStatus === "needs_times") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-200">
        {swatch}
        Bell times needed
      </span>
    );
  }
  const first = formatTime(schedule.firstStartTime);
  const last = formatTime(schedule.lastEndTime);
  const periodLabel = `${schedule.periodCount} ${
    schedule.periodCount === 1 ? "period" : "periods"
  }`;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
      {swatch}
      {periodLabel}
      {first && last ? `, ${first}-${last}` : ""}
    </span>
  );
}

function getScheduleName(scheduleMap: Map<string, WizardScheduleSummary>, id: string | null) {
  if (!id) return "No schedule";
  return scheduleMap.get(id)?.name || "Unknown schedule";
}

function warningMessage(warning: CalendarGenerationWarning) {
  const dateText = warning.dates?.length ? `${warning.dates.join(", ")}: ` : "";
  switch (warning.code) {
    case "special_day_overlaps_no_school":
      return `${dateText}A date is listed as both no school and a special school day. Sundial kept it as no school.`;
    case "weekday_pattern_missing_schedule":
      return "A selected weekday is missing a schedule.";
    case "instructional_day_missing_schedule":
      return `${dateText}An instructional day is missing a schedule.`;
    case "overlapping_no_school_ranges":
      return "Two no-school entries overlap.";
    case "overlapping_special_days":
    case "duplicate_special_day":
      return `${dateText}Multiple special school day entries overlap.`;
    case "no_school_range_outside_year":
      return "A no-school entry falls outside the selected school year.";
    case "special_day_outside_year":
      return "A special school day falls outside the selected school year.";
    case "start_date_after_end_date":
      return "The first instructional date must come before the last date.";
    case "repeating_pattern_missing_schedules":
      return "The repeating schedule pattern needs at least one schedule.";
    case "no_operating_weekdays":
      return "Choose at least one weekday when school normally operates.";
    default:
      return warning.message;
  }
}

function buildPreviewResult(draft: WizardDraft) {
  const config = buildConfig({
    ...draft,
    noSchoolRanges: [],
    specialDays: [],
    informationalDates: [],
  });
  return config ? generateSchoolYearCalendar(config) : null;
}

export default function ScheduleWizardClient({
  schoolId,
  schoolSlug,
  schoolName,
  adminBasePath,
  schedules,
  existingCalendarRange,
  initialSavedDraft,
  flowMode = "guided",
  launchContext = null,
  setupChooserHref,
}: {
  schoolId: string;
  schoolSlug: string;
  schoolName: string;
  adminBasePath: string;
  schedules: WizardScheduleSummary[];
  existingCalendarRange: ExistingCalendarRangeSummary;
  initialSavedDraft: CalendarWizardDraftRecord | null;
  flowMode?: CalendarWizardFlowType;
  launchContext?: CalendarWizardLaunchContext | null;
  setupChooserHref: string;
}) {
  const draftType = getDraftTypeForCalendarWizardFlow(flowMode);
  const isAiMode = flowMode === "ai";
  const isGuidedMode = flowMode === "guided";
  const storageKey = `sundial:calendar-wizard:${schoolId}:${flowMode}`;
  const legacyStorageKey = `sundial:schedule-wizard:${schoolId}:${schoolSlug}`;
  const unsafeSlugStorageKey = `calendar-wizard-${flowMode}:${schoolSlug}`;
  const pageTitle = isAiMode ? "AI Calendar Import" : "Guided Calendar Setup";
  const pageDescription = isAiMode
    ? "Upload your school calendar PDF, review Sundial's draft, and create the calendar."
    : "Build a school-year calendar from your normal schedule, closures, and special school days.";
  const setupContextActive = launchContext === "setup";
  const calendarDashboardHref = `${adminBasePath}/calendar`;
  const backHref = setupContextActive ? setupChooserHref : calendarDashboardHref;
  const finishLaterHref = setupContextActive ? `${setupChooserHref}?saved=1` : calendarDashboardHref;
  const alternateFlowHref = appendCalendarWizardLaunchContext(
    isAiMode
      ? `${adminBasePath}/calendar/wizard/guided`
      : `${adminBasePath}/calendar/wizard/ai`,
    launchContext
  );
  const alternateFlowLabel = isAiMode
    ? "Use Guided Setup instead"
    : "Use AI Calendar Import instead";
  const [draft, setDraft] = useState<WizardDraft>(() => createDefaultDraft(schedules));
  const [currentStep, setCurrentStep] = useState<WizardStep>("school-year");
  const [draftLoading, setDraftLoading] = useState(true);
  const [errors, setErrors] = useState<StepErrors>({});
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showAiCreateModal, setShowAiCreateModal] = useState(false);
  const [saveResult, setSaveResult] = useState<GenerateCalendarActionResult | null>(null);
  const [aiCreateResult, setAiCreateResult] = useState<GenerateCalendarActionResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<SaveStatus>("idle");
  const [lastKnownUpdatedAt, setLastKnownUpdatedAt] = useState<string | null>(null);
  const [lastSavedMessage, setLastSavedMessage] = useState("");
  const autosaveTimerRef = useRef<number | null>(null);
  const intentionalNavigationRef = useRef(false);
  const hasUnsavedChangesRef = useRef(false);
  const lastSavedDraftSnapshotRef = useRef<string | null>(null);
  const [completionSummary, setCompletionSummary] =
    useState<CalendarCompletionSummary | null>(null);

  const currentStepIndex = WIZARD_STEPS.findIndex((step) => step.id === currentStep);
  const scheduleMap = useMemo(
    () => new Map(schedules.map((schedule) => [schedule.id, schedule])),
    [schedules]
  );
  const config = useMemo(() => buildConfig(draft), [draft]);
  const generationResult = useMemo(
    () => (config ? generateSchoolYearCalendar(config) : null),
    [config]
  );
  const isAiQuickReview = Boolean(
    draft.aiImport?.state === "review" && draft.aiImport.result
  );

  async function saveCurrentDraft(
    nextDraft = draft,
    nextStep = currentStep,
    options: { immediate?: boolean; redirectAfterSave?: string } = {}
  ) {
    if (!isMeaningfulDraft(nextDraft)) return null;

    const storedData = buildStoredDraft(nextDraft, nextStep);
    const storedSnapshot = JSON.stringify(storedData);
    const localUpdatedAt = new Date().toISOString();
    saveLocalStoredDraft(storageKey, storedData, localUpdatedAt);
    setDraftSaveStatus("saving");

    const result = await saveCalendarWizardDraft(schoolSlug, {
      wizardData: storedData,
      lastKnownUpdatedAt,
      draftType,
    });

    if (result.status === "success" && result.draft) {
      setLastKnownUpdatedAt(result.draft.updated_at);
      setDraftSaveStatus("saved");
      setLastSavedMessage("Draft saved");
      hasUnsavedChangesRef.current = false;
      lastSavedDraftSnapshotRef.current = storedSnapshot;
      saveLocalStoredDraft(storageKey, result.draft.wizard_data, result.draft.updated_at);
      if (options.redirectAfterSave) {
        allowIntentionalNavigation();
        window.location.assign(options.redirectAfterSave);
      }
      return result;
    }

    if (result.status === "draft_conflict") {
      setDraftSaveStatus("conflict");
      setLastSavedMessage(result.message);
      return result;
    }

    setDraftSaveStatus("error");
    setLastSavedMessage(
      result.status === "success" ? "Could not save draft" : result.message
    );
    return result;
  }

  useEffect(() => {
    window.setTimeout(() => {
      // Slug-only keys can outlive a deleted school and leak into a future
      // tenant that reuses the slug, so they are invalidated, never restored.
      window.sessionStorage.removeItem(unsafeSlugStorageKey);
      let localStored = parseLocalStoredDraft(window.sessionStorage.getItem(storageKey));
      const legacyStored = parseLocalStoredDraft(window.sessionStorage.getItem(legacyStorageKey));
      if (!localStored && legacyStored) {
        const legacyFlow = legacyStored.data.draft.aiImport?.result ? "ai" : "guided";
        if (legacyFlow === flowMode) {
          localStored = legacyStored;
          window.sessionStorage.setItem(storageKey, window.sessionStorage.getItem(legacyStorageKey) || "");
          window.sessionStorage.removeItem(legacyStorageKey);
        }
      }
      const source = chooseCalendarWizardDraftSource({
        databaseUpdatedAt: initialSavedDraft?.updated_at,
        sessionUpdatedAt: localStored?.updatedAt,
      });
      let restoredDraft: WizardDraft | null = null;
      let restoredStep: WizardStep = "school-year";
      let restoredUpdatedAt: string | null = null;
      let shouldSaveLocalOverDatabase = false;

      if (
        source === "session" &&
        localStored &&
        (!initialSavedDraft ||
          window.confirm(
            "This browser has newer calendar setup progress than the saved database draft. Use the local progress instead?"
          ))
      ) {
        const restored = sanitizeRestoredDraft(localStored.data.draft, schedules);
        if (restored && isMeaningfulDraft(restored)) {
          restoredDraft = restored;
          restoredStep = localStored.data.currentStep;
          restoredUpdatedAt = localStored.updatedAt;
          shouldSaveLocalOverDatabase = Boolean(initialSavedDraft);
        }
      } else if (initialSavedDraft) {
        restoredDraft =
          sanitizeRestoredDraft(initialSavedDraft.wizard_data.draft, schedules) ||
          createDefaultDraft(schedules);
        restoredStep = initialSavedDraft.wizard_data.currentStep;
        restoredUpdatedAt = initialSavedDraft.updated_at;
      }

      if (restoredDraft) {
        setDraft(restoredDraft);
        setCurrentStep(restoredStep);
      }
      lastSavedDraftSnapshotRef.current =
        restoredDraft &&
        restoredUpdatedAt &&
        !shouldSaveLocalOverDatabase &&
        !(source === "session" && !initialSavedDraft)
          ? JSON.stringify(buildStoredDraft(restoredDraft, restoredStep))
          : null;
      hasUnsavedChangesRef.current = Boolean(
        restoredDraft &&
          isMeaningfulDraft(restoredDraft) &&
          !lastSavedDraftSnapshotRef.current
      );
      setLastKnownUpdatedAt(source === "session" && !initialSavedDraft ? null : restoredUpdatedAt);
      setDraftSaveStatus(restoredUpdatedAt ? "saved" : "idle");
      setLastSavedMessage(restoredUpdatedAt ? "Draft saved" : "");
      setDraftLoading(false);

      if (shouldSaveLocalOverDatabase && restoredDraft) {
        void saveCurrentDraft(restoredDraft, restoredStep, { immediate: true });
      }
    }, 0);
    // Run once after hydration to resolve DB/session conflicts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (draftLoading) return undefined;

    const storedData = buildStoredDraft(draft, currentStep);
    const storedSnapshot = JSON.stringify(storedData);
    const localUpdatedAt = new Date().toISOString();
    saveLocalStoredDraft(storageKey, storedData, localUpdatedAt);

    if (!isMeaningfulDraft(draft)) {
      hasUnsavedChangesRef.current = false;
      return;
    }

    hasUnsavedChangesRef.current = storedSnapshot !== lastSavedDraftSnapshotRef.current;
    if (!hasUnsavedChangesRef.current) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      setDraftSaveStatus("saving");
      void saveCurrentDraft(draft, currentStep);
    }, 1000);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
    // saveCurrentDraft intentionally participates through the current render closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, draft, draftLoading, storageKey]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (intentionalNavigationRef.current) return;
      if (isSaving) return;
      if (completionSummary) return;
      if (!isMeaningfulDraft(draft)) return;
      if (!hasUnsavedChangesRef.current) return;
      event.preventDefault();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [completionSummary, draft, isSaving]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("startOver") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      void startOver();
    }
    // Run once to honor the Calendar page Start Over entry point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateDraft(updater: (draft: WizardDraft) => WizardDraft) {
    hasUnsavedChangesRef.current = true;
    setDraft((previousDraft) => updater(previousDraft));
  }

  function allowIntentionalNavigation() {
    intentionalNavigationRef.current = true;
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }

  function restoreAccidentalNavigationGuard() {
    intentionalNavigationRef.current = false;
  }

  function goToStep(step: WizardStep) {
    const targetIndex = WIZARD_STEPS.findIndex((wizardStep) => wizardStep.id === step);
    const isCompleted = draft.completedSteps.includes(step);
    if (targetIndex <= currentStepIndex || isCompleted) {
      setCurrentStep(step);
      setErrors({});
      void saveCurrentDraft(draft, step, { immediate: true });
    }
  }

  function continueStep() {
    const nextErrors = validateStep(currentStep, draft, schedules);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    updateDraft((previousDraft) => ({
      ...previousDraft,
      completedSteps: Array.from(new Set([...previousDraft.completedSteps, currentStep])),
    }));

    const nextStep = WIZARD_STEPS[currentStepIndex + 1]?.id;
    if (nextStep) {
      setCurrentStep(nextStep);
      setErrors({});
      void saveCurrentDraft(
        {
          ...draft,
          completedSteps: Array.from(new Set([...draft.completedSteps, currentStep])),
        },
        nextStep,
        { immediate: true }
      );
    }
  }

  function backStep() {
    const previousStep = WIZARD_STEPS[currentStepIndex - 1]?.id;
    if (previousStep) {
      setCurrentStep(previousStep);
      setErrors({});
      void saveCurrentDraft(draft, previousStep, { immediate: true });
    }
  }

  async function startOver() {
    if (
      isMeaningfulDraft(draft) &&
      !window.confirm(`Clear this ${isAiMode ? "AI Calendar Import" : "Guided Setup"} draft and start over?`)
    ) {
      return;
    }

    setDraftSaveStatus("saving");
    const result = await deleteCalendarWizardDraft(schoolSlug, draftType);
    if (result.status !== "success") {
      setDraftSaveStatus("error");
      setLastSavedMessage(result.message);
      return;
    }

    const nextDraft = clearAiImportMetadata(createDefaultDraft(schedules));
    window.sessionStorage.removeItem(storageKey);
    hasUnsavedChangesRef.current = false;
    lastSavedDraftSnapshotRef.current = null;
    setLastKnownUpdatedAt(null);
    setDraftSaveStatus("idle");
    setLastSavedMessage("");
    setDraft(nextDraft);
    setCurrentStep("school-year");
    setErrors({});

    if (setupContextActive) {
      allowIntentionalNavigation();
      window.location.assign(setupChooserHref);
    }
  }

  function openGenerateModal() {
    setSaveResult(null);
    setShowGenerateModal(true);
  }

  async function handleGenerateCalendar(replaceExisting = false) {
    if (!config || isSaving) return;

    allowIntentionalNavigation();
    setIsSaving(true);
    setSaveResult(null);

    try {
      const result = await generateCalendarAction(schoolSlug, {
        config,
        replaceExisting,
        launchContext,
      });

      if (result.status === "success") {
        window.sessionStorage.removeItem(storageKey);
        await deleteCalendarWizardDraft(schoolSlug, draftType);
        if (result.redirectTo) {
          window.location.assign(result.redirectTo);
          return;
        }
        setCompletionSummary(result.summary);
        setShowGenerateModal(false);
        setSaveResult(null);
        return;
      }

      setSaveResult(result);
      setShowGenerateModal(true);
      restoreAccidentalNavigationGuard();
    } catch {
      setSaveResult({
        status: "server_error",
        message: "Sundial could not generate the calendar. Please try again.",
      });
      setShowGenerateModal(true);
      restoreAccidentalNavigationGuard();
    } finally {
      setIsSaving(false);
    }
  }

  async function finishLater() {
    const result = await saveCurrentDraft(draft, currentStep, { immediate: true });
    if (!result || result.status === "success") {
      window.alert(
        setupContextActive
          ? "Your calendar setup has been saved. Create the calendar to unlock Launch."
          : "Your calendar setup has been saved. You can continue from any device."
      );
      allowIntentionalNavigation();
      window.location.assign(finishLaterHref);
    }
  }

  async function saveAndReturnToSetup() {
    const result = await saveCurrentDraft(draft, currentStep, {
      immediate: true,
      redirectAfterSave: setupChooserHref,
    });

    if (!result) {
      allowIntentionalNavigation();
      window.location.assign(setupChooserHref);
    }
  }

  async function openAiCreateModal() {
    setAiCreateResult(null);
    setShowAiCreateModal(true);
  }

  async function handleCreateAiCalendar(replaceExisting = false) {
    if (isSaving) return;

    allowIntentionalNavigation();
    setIsSaving(true);
    setAiCreateResult(null);

    try {
      const saved = await saveCurrentDraft(draft, currentStep, { immediate: true });
      if (saved?.status !== "success" || !saved.draft) {
        const message =
          saved && "message" in saved
            ? saved.message
            : "Sundial could not save the latest AI review before creating the calendar.";
        setAiCreateResult({
          status: saved?.status === "draft_conflict" ? "draft_conflict" : "server_error",
          message,
        });
        restoreAccidentalNavigationGuard();
        return;
      }

      const result = await createAiCalendarFromDraftAction(schoolSlug, {
        replaceExisting,
        expectedDraftUpdatedAt: saved.draft.updated_at,
        launchContext,
      });

      if (result.status === "success") {
        window.sessionStorage.removeItem(storageKey);
        if (result.redirectTo) {
          window.location.assign(result.redirectTo);
          return;
        }
        setCompletionSummary(result.summary);
        setShowAiCreateModal(false);
        setAiCreateResult(null);
        return;
      }

      setAiCreateResult(result);
      setShowAiCreateModal(true);
      restoreAccidentalNavigationGuard();
    } catch {
      setAiCreateResult({
        status: "server_error",
        message: "Sundial could not create the imported calendar. No changes were saved.",
      });
      setShowAiCreateModal(true);
      restoreAccidentalNavigationGuard();
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAndOpenSchedule(tempId: string, detectedName: string) {
    const returnTo = appendCalendarWizardLaunchContext(
      `${adminBasePath}/calendar/wizard/ai`,
      launchContext
    );
    const href = `${adminBasePath}/schedules/new?name=${encodeURIComponent(
      detectedName
    )}&aiTempId=${encodeURIComponent(tempId)}&returnTo=${encodeURIComponent(returnTo)}`;
    await saveCurrentDraft(draft, currentStep, {
      immediate: true,
      redirectAfterSave: href,
    });
  }

  if (completionSummary) {
    return (
      <CompletionScreen
        schoolName={schoolName}
        adminBasePath={adminBasePath}
        summary={completionSummary}
      />
    );
  }

  if (draftLoading) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
        <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {schoolName} Admin
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                {pageTitle}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                {pageDescription}
              </p>
            </div>
          </div>

          <section
            className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#D4A017] border-t-transparent motion-reduce:animate-none" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                Loading saved calendar setup...
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {schoolName} Admin
            </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
              {pageTitle}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              {pageDescription}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={startOver} className={subtleButtonClass}>
              Start Over
            </button>
            <Link href={alternateFlowHref} className={secondaryButtonClass}>
              {alternateFlowLabel}
            </Link>
            {isAiMode && (
              <button type="button" onClick={finishLater} className={secondaryButtonClass}>
                Finish Later
              </button>
            )}
            {setupContextActive ? (
              <button
                type="button"
                onClick={() => void saveAndReturnToSetup()}
                className={secondaryButtonClass}
              >
                Back to Setup
              </button>
            ) : (
              <Link href={backHref} className={secondaryButtonClass}>
                Back to Calendar
              </Link>
            )}
          </div>
        </div>

        {existingCalendarRange.firstDate && existingCalendarRange.lastDate && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
            Existing calendar dates are currently stored from{" "}
            <strong>{formatDateForDisplay(existingCalendarRange.firstDate)}</strong> to{" "}
            <strong>{formatDateForDisplay(existingCalendarRange.lastDate)}</strong>.
            Phase 4 will ask before replacing any dates.
          </div>
        )}

        {isGuidedMode && !isAiQuickReview && (
          <WizardProgress
            currentStep={currentStep}
            completedSteps={draft.completedSteps}
            onStepClick={goToStep}
          />
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] lg:p-7">
          {draft.aiImport?.banner && (
            <div
              className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100"
              role="status"
            >
              {draft.aiImport.banner}
            </div>
          )}

          {isAiMode ? (
            <AiCalendarImportCard
              schoolSlug={schoolSlug}
              schedules={schedules}
              draft={draft}
              onAddTimesNow={saveAndOpenSchedule}
              onImmediateSave={saveCurrentDraft}
              onCreateCalendar={openAiCreateModal}
              updateDraft={updateDraft}
              setCurrentStep={setCurrentStep}
            />
          ) : currentStep === "school-year" && (
            <div className="space-y-7">
              <SchoolYearStep draft={draft} errors={errors} updateDraft={updateDraft} />
            </div>
          )}
          {isGuidedMode && currentStep === "normal-schedule" && (
            <NormalScheduleStep
              draft={draft}
              schedules={schedules}
              scheduleMap={scheduleMap}
              adminBasePath={adminBasePath}
              onAddTimesNow={saveAndOpenSchedule}
              errors={errors}
              updateDraft={updateDraft}
            />
          )}
          {isGuidedMode && currentStep === "no-school" && (
            <NoSchoolDaysStep draft={draft} errors={errors} updateDraft={updateDraft} />
          )}
          {isGuidedMode && currentStep === "special-days" && (
            <SpecialSchoolDaysStep
              draft={draft}
              schedules={schedules}
              scheduleMap={scheduleMap}
              errors={errors}
              updateDraft={updateDraft}
            />
          )}
          {isGuidedMode && currentStep === "review" && (
            <ReviewCalendarStep
              draft={draft}
              result={generationResult}
              scheduleMap={scheduleMap}
              setCurrentStep={setCurrentStep}
              onGenerate={openGenerateModal}
            />
          )}

          {isGuidedMode && !isAiQuickReview && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-[#3a3a3a]">
            <button
              type="button"
              onClick={backStep}
              disabled={currentStepIndex === 0}
              className={secondaryButtonClass}
            >
              Back
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {draftSaveStatus === "saving"
                  ? "Saving..."
                  : draftSaveStatus === "saved"
                    ? lastSavedMessage || "Draft saved"
                    : draftSaveStatus === "conflict"
                      ? "This draft was updated by another administrator."
                      : draftSaveStatus === "error"
                        ? lastSavedMessage || "Could not save draft"
                        : "Draft will save automatically"}
              </p>
              <button type="button" onClick={finishLater} className={secondaryButtonClass}>
                Finish Later
              </button>
              <button
                type="button"
                onClick={() => void saveCurrentDraft(draft, currentStep, { immediate: true })}
                className={secondaryButtonClass}
              >
                Save Draft
              </button>
              {currentStep !== "review" ? (
                <button
                  type="button"
                  onClick={continueStep}
                  className={sundialPrimaryButtonClass("px-5")}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openGenerateModal}
                  disabled={isSaving}
                  className={sundialPrimaryButtonClass("px-5")}
                >
                  Generate Calendar
                </button>
              )}
            </div>
          </div>
          )}
        </section>
      </div>

      {showGenerateModal && generationResult && (
        <GenerateModal
          result={generationResult}
          actionResult={saveResult}
          isSaving={isSaving}
          onConfirm={() => handleGenerateCalendar(false)}
          onReplace={() => handleGenerateCalendar(true)}
          onClose={() => {
            if (!isSaving) {
              setShowGenerateModal(false);
            }
          }}
        />
      )}

      {showAiCreateModal && draft.aiImport?.result && (
        <AiCreateCalendarModal
          importResult={draft.aiImport.result}
          resolutions={draft.aiImport.resolutions}
          warningResolutions={draft.aiImport.warningResolutions || []}
          actionResult={aiCreateResult}
          isSaving={isSaving}
          onConfirm={() => void handleCreateAiCalendar(false)}
          onReplace={() => void handleCreateAiCalendar(true)}
          onClose={() => {
            if (!isSaving) {
              setShowAiCreateModal(false);
            }
          }}
        />
      )}
    </main>
  );
}

function WizardProgress({
  currentStep,
  completedSteps,
  onStepClick,
}: {
  currentStep: WizardStep;
  completedSteps: WizardStep[];
  onStepClick: (step: WizardStep) => void;
}) {
  const currentIndex = WIZARD_STEPS.findIndex((step) => step.id === currentStep);
  const percent = Math.round((completedSteps.length / WIZARD_STEPS.length) * 100);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          Step {currentIndex + 1} of {WIZARD_STEPS.length}
        </p>
        <p className="text-sm font-bold text-[#9A7209] dark:text-[#F6C64A]">
          {percent}% complete
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-black">
        <div
          className="h-full rounded-full bg-[#D4A017] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol className="mt-4 grid gap-2 md:grid-cols-5">
        {WIZARD_STEPS.map((step, index) => {
          const isCurrent = step.id === currentStep;
          const isComplete = completedSteps.includes(step.id);
          const isClickable = isComplete || index <= currentIndex;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step.id)}
                disabled={!isClickable}
                aria-current={isCurrent ? "step" : undefined}
                className={[
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition",
                  isCurrent
                    ? "border-[#D4A017] bg-amber-50 text-slate-950 dark:bg-amber-950/25 dark:text-white"
                    : isComplete
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100"
                      : "border-slate-200 bg-slate-50 text-slate-500 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-black dark:text-slate-400",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    isComplete
                      ? "bg-emerald-500 text-white"
                      : isCurrent
                        ? "bg-[#D4A017] text-white"
                        : "bg-slate-200 text-slate-500 dark:bg-slate-800",
                  ].join(" ")}
                >
                  {isComplete ? "✓" : index + 1}
                </span>
                <span className="font-bold">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AiCalendarImportCard({
  schoolSlug,
  schedules,
  draft,
  onAddTimesNow,
  onImmediateSave,
  onCreateCalendar,
  updateDraft,
  setCurrentStep,
}: {
  schoolSlug: string;
  schedules: WizardScheduleSummary[];
  draft: WizardDraft;
  onAddTimesNow: (tempId: string, detectedName: string) => Promise<void>;
  onImmediateSave: (draft: WizardDraft, step: WizardStep) => Promise<CalendarWizardDraftActionResult | null>;
  onCreateCalendar: () => Promise<void>;
  updateDraft: (updater: (draft: WizardDraft) => WizardDraft) => void;
  setCurrentStep: (step: WizardStep) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<AiImportReviewState>(
    draft.aiImport?.state || "idle"
  );
  const [message, setMessage] = useState("");
  const [actionResult, setActionResult] =
    useState<AnalyzeCalendarPdfResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const isWorking = status === "uploading" || status === "analyzing";
  const importResult = draft.aiImport?.result;
  const resolutions = draft.aiImport?.resolutions || [];
  const failureMessage =
    actionResult?.status && actionResult.status !== "success"
      ? actionResult.message
      : status === "failed"
        ? message
        : "";
  const failureRetryable =
    Boolean(selectedFile) &&
    (!actionResult ||
      (actionResult.status !== "success" &&
        actionResult.status !== "permission_error" &&
        actionResult.retryable !== false));

  useEffect(() => {
    if (!isWorking) return undefined;

    const interval = window.setInterval(() => {
      setElapsedSeconds((previousElapsed) => {
        const nextElapsed = previousElapsed + 1;
        setProgress((previousProgress) =>
          getEstimatedAiImportProgress(nextElapsed, previousProgress)
        );
        return nextElapsed;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isWorking]);

  function selectFile(file: File | null) {
    setActionResult(null);
    setMessage("");
    setProgress(getAiImportProgressAfterRetry());
    setElapsedSeconds(0);

    if (!file) {
      setSelectedFile(null);
      setStatus("idle");
      return;
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf || file.size === 0 || file.size > MAX_IMPORT_FILE_BYTES) {
      setSelectedFile(null);
      setStatus("failed");
      setMessage("Please upload a PDF calendar smaller than 20 MB.");
      return;
    }

    setSelectedFile(file);
    setStatus("file_selected");
    setMessage(`${file.name} selected.`);
  }

  async function analyzeSelectedFile(analyzeAgain = false) {
    if (!selectedFile || isWorking) return;

    const timeoutController = createAiImportClientTimeoutController();
    setStatus("uploading");
    setMessage("Reading your calendar...");
    setActionResult(null);
    setProgress(5);
    setElapsedSeconds(0);

    const formData = new FormData();
    formData.append("calendarPdf", selectedFile);
    if (analyzeAgain) formData.append("analyzeAgain", "true");

    try {
      setStatus("analyzing");
      setMessage("Finding school dates and checking schedule patterns...");
      const response = await fetch(
        `/api/admin/${encodeURIComponent(schoolSlug)}/calendar/ai-import`,
        {
          method: "POST",
          body: formData,
          signal: timeoutController.controller.signal,
        }
      );
      const result = await parseAiImportResponse(response);
      const requestId = response.headers.get("x-sundial-ai-import-request-id");
      setActionResult(result);

      if (result.status !== "success") {
        setStatus(result.status === "validation_error" ? "failed" : "failed");
        setMessage(result.message);
        return;
      }

      const schemaValidation = validateAiCalendarImportResult(result.importResult);
      if (!schemaValidation.success) {
        const reasonCode = getAiImportValidationReasonCode(
          schemaValidation.validationErrors
        );
        const failure = buildAiImportProcessingFailure(
          "schema_validation",
          new Error(
            JSON.stringify(
              summarizeAiImportValidationErrors(schemaValidation.validationErrors)
            )
          ),
          requestId
        );
        failure.reasonCode = reasonCode;
        failure.message =
          "Sundial read the PDF, but one part of the calendar could not be validated. Retry, or continue manually.";
        setActionResult(failure);
        setStatus("failed");
        setMessage(failure.message);
        return;
      }

      setProgress(getAiImportProgressAfterSuccess());
      setStatus("complete");
      setMessage(
        result.outcome === "repaired"
          ? "Sundial corrected a formatting issue and completed the analysis."
          : result.outcome === "reviewable"
            ? "Sundial read the calendar, but one item needs your review."
            : "Calendar analysis complete."
      );
      await new Promise((resolve) => window.setTimeout(resolve, 400));

      let matchedResolutions: DetectedScheduleResolution[];
      let warningResolutions: AiImportWarningResolution[];
      let nextState: "complete" | "complete_with_warnings";
      try {
        matchedResolutions = matchDetectedSchedules(
          result.importResult.detectedSchedules,
          schedules
        );
        warningResolutions = createDefaultWarningResolutions(result.importResult.warnings);
        nextState =
          result.importResult.warnings.length > 0 ? "complete_with_warnings" : "complete";
      } catch (error) {
        const failure = buildAiImportProcessingFailure(
          "review_generation",
          error,
          requestId
        );
        setActionResult(failure);
        setStatus("failed");
        setMessage(failure.message);
        return;
      }

      try {
        getDetectedScheduleUsageCounts(result.importResult);
      } catch (error) {
        const failure = buildAiImportProcessingFailure(
          "consistency_checks",
          error,
          requestId
        );
        setActionResult(failure);
        setStatus("failed");
        setMessage(failure.message);
        return;
      }

      setStatus("review");
      setMessage(
        nextState === "complete_with_warnings"
          ? "Analysis completed with warnings. Review before creating your calendar."
          : "Analysis complete. Review before creating your calendar."
      );
      try {
        updateDraft((previousDraft) => ({
          ...previousDraft,
          aiImport: {
            state: "review",
            fileName: selectedFile.name,
            result: result.importResult,
            resolutions: matchedResolutions,
            warnings: result.importResult.warnings,
            warningResolutions,
            banner:
              result.outcome === "repaired"
                ? "Sundial corrected a formatting issue and completed the analysis."
                : result.outcome === "reviewable"
                  ? "Sundial read the calendar, but one item needs your review."
                  : "Calendar analysis complete.",
          },
        }));
      } catch (error) {
        const failure = buildAiImportProcessingFailure(
          "draft_persistence",
          error,
          requestId
        );
        setActionResult(failure);
        setStatus("failed");
        setMessage(failure.message);
      }
    } catch (error) {
      const result = mapAiImportClientError(error);
      setActionResult(result);
      setStatus("failed");
      setMessage(result.message);
    } finally {
      timeoutController.clear();
    }
  }

  function updateResolution(tempId: string, existingScheduleId: string) {
    updateDraft((previousDraft) => {
      if (!previousDraft.aiImport?.result) return previousDraft;
      const detected = previousDraft.aiImport.result.detectedSchedules.find(
        (schedule) => schedule.tempId === tempId
      );
      if (!detected) return previousDraft;
      const matchedSchedule = schedules.find((schedule) => schedule.id === existingScheduleId);

      const nextResolutions = previousDraft.aiImport.resolutions.map((resolution) =>
        resolution.tempId === tempId
          ? {
              ...resolution,
              matchedExistingScheduleId: existingScheduleId || null,
              status: existingScheduleId ? "matched_by_admin" : "needs_times",
              needsSetup: !existingScheduleId,
              calendarColor: existingScheduleId
                ? matchedSchedule?.calendarColor || null
                : resolution.calendarColor,
              setupChoice: existingScheduleId ? "add_later" : resolution.setupChoice || "add_later",
            }
          : resolution
      ) satisfies DetectedScheduleResolution[];

      return {
        ...previousDraft,
        aiImport: {
          ...previousDraft.aiImport,
          state: "review",
          resolutions: nextResolutions,
        },
      };
    });
  }

  function applyImport() {
    if (!importResult) return;
    if (
      hasMeaningfulManualProgress(draft) &&
      !window.confirm(
        "Use this AI import? Your current wizard answers will be replaced by the imported draft, and you can review everything before generating."
      )
    ) {
      return;
    }
    const conversion = convertAiImportToWizardDraft(
      draft,
      importResult,
      resolutions,
      draft.aiImport?.fileName
    );
    updateDraft(() => conversion.draft);
    setStatus("applied");
    setMessage("AI import added. Review the highlighted items before generating your calendar.");
    setCurrentStep(conversion.earliestStep);
    void onImmediateSave(conversion.draft, conversion.earliestStep);
  }

  function continueManually() {
    updateDraft((previousDraft) => ({
      ...previousDraft,
      aiImport: previousDraft.aiImport
        ? { ...previousDraft.aiImport, state: "idle", banner: undefined }
        : null,
    }));
  }

  function updateReviewedName(tempId: string, reviewedName: string) {
    updateDraft((previousDraft) => {
      if (!previousDraft.aiImport?.result) return previousDraft;
      return {
        ...previousDraft,
        aiImport: {
          ...previousDraft.aiImport,
          state: "review",
          resolutions: previousDraft.aiImport.resolutions.map((resolution) =>
            resolution.tempId === tempId ? { ...resolution, reviewedName } : resolution
          ),
        },
      };
    });
  }

  function updateScheduleColor(tempId: string, calendarColor: string | null) {
    updateDraft((previousDraft) => {
      if (!previousDraft.aiImport?.result) return previousDraft;
      return {
        ...previousDraft,
        aiImport: {
          ...previousDraft.aiImport,
          state: "review",
          resolutions: previousDraft.aiImport.resolutions.map((resolution) =>
            resolution.tempId === tempId ? { ...resolution, calendarColor } : resolution
          ),
        },
      };
    });
  }

  function updateSetupChoice(
    tempId: string,
    setupChoice: NonNullable<DetectedScheduleResolution["setupChoice"]>
  ) {
    updateDraft((previousDraft) => {
      if (!previousDraft.aiImport?.result) return previousDraft;
      return {
        ...previousDraft,
        aiImport: {
          ...previousDraft.aiImport,
          state: "review",
          resolutions: previousDraft.aiImport.resolutions.map((resolution) =>
            resolution.tempId === tempId ? { ...resolution, setupChoice } : resolution
          ),
        },
      };
    });
  }

  function updateWarningResolution(
    code: string,
    status: AiImportWarningResolution["status"]
  ) {
    updateDraft((previousDraft) => {
      if (!previousDraft.aiImport?.result) return previousDraft;
      const existing =
        previousDraft.aiImport.warningResolutions ||
        createDefaultWarningResolutions(previousDraft.aiImport.result.warnings);
      const nextResolutions = existing.some((resolution) => resolution.code === code)
        ? existing.map((resolution) =>
            resolution.code === code ? { ...resolution, status } : resolution
          )
        : [...existing, { code, status }];

      return {
        ...previousDraft,
        aiImport: {
          ...previousDraft.aiImport,
          state: "review",
          warningResolutions: nextResolutions,
        },
      };
    });
  }

  function removeDetectedSchedule(
    tempId: string,
    action: AiScheduleRemovalAction
  ) {
    updateDraft((previousDraft) => {
      if (!previousDraft.aiImport?.result) return previousDraft;
      const removal = removeAiDetectedSchedule({
        importResult: previousDraft.aiImport.result,
        tempId,
        action,
      });

      if (!removal.success) {
        window.alert(removal.message);
        return previousDraft;
      }

      const nextResolutions = previousDraft.aiImport.resolutions.filter(
        (resolution) => resolution.tempId !== tempId
      );
      const nextResolutionMap = new Map(
        nextResolutions.map((resolution) => [resolution.tempId, resolution])
      );
      const removedSchedules = [
        ...(previousDraft.aiImport.removedSchedules || []),
        removal.removedSchedule,
      ];
      const usageMessage =
        removal.affectedDayCount > 0
          ? ` ${pluralize(removal.affectedDayCount, "date")} ${
              removal.removedSchedule.action === "marked_no_school"
                ? removal.affectedDayCount === 1
                  ? "was changed to a no-school day."
                  : "were changed to no-school days."
                : "were updated."
            }`
          : "";

      return {
        ...previousDraft,
        aiImport: {
          ...previousDraft.aiImport,
          state: "review",
          result: removal.importResult,
          resolutions: nextResolutions,
          removedSchedules,
          unresolvedRequiredScheduleIds: getRequiredDetectedScheduleIds(
            removal.importResult
          ).filter((requiredTempId) => /^(ai-|temp-|mock-)/i.test(requiredTempId)).filter((requiredTempId) => {
            const resolution = nextResolutionMap.get(requiredTempId);
            return !resolution || !resolution.matchedExistingScheduleId;
          }),
          banner: `Removed '${removal.removedSchedule.name}' from the imported calendar.${usageMessage}`,
        },
      };
    });
  }

  function startAiReviewOver() {
    setSelectedFile(null);
    setStatus("idle");
    setMessage("");
    setActionResult(null);
    setProgress(0);
    setElapsedSeconds(0);
    updateDraft((previousDraft) => clearAiImportMetadata(previousDraft));
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold">AI Calendar Import</h2>
            <span className="rounded-full bg-[#D4A017]/15 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#9A7209] dark:text-[#F6C64A]">
              Beta
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Upload your school calendar PDF and Sundial will try to identify the school
            year, normal schedule patterns, holidays, breaks, finals, rallies, minimum
            days, and other special school days.
          </p>
        </div>
        <button
          type="button"
          onClick={continueManually}
          className={secondaryButtonClass}
        >
          Continue Manually
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="block text-sm font-bold">
          Upload calendar PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => selectFile(event.target.files?.[0] || null)}
            className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-bold file:text-slate-700 hover:file:bg-slate-200 dark:border-slate-700 dark:bg-black dark:text-slate-200 dark:file:bg-slate-800 dark:file:text-slate-100"
            disabled={isWorking}
            aria-describedby="ai-import-help ai-import-status"
          />
        </label>
        <button
          type="button"
          onClick={() => analyzeSelectedFile(false)}
          disabled={!selectedFile || isWorking}
          className={sundialPrimaryButtonClass("px-5")}
        >
          {isWorking ? "Analyzing..." : "Upload Calendar PDF"}
        </button>
        {draft.aiImport?.result && selectedFile && !isWorking && (
          <button
            type="button"
            onClick={() => analyzeSelectedFile(true)}
            className={secondaryButtonClass}
          >
            Analyze Again
          </button>
        )}
      </div>

      <p id="ai-import-help" className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
        Your PDF is sent securely to our AI provider for analysis and is not added to
        your calendar until you review it.
      </p>
      <p id="ai-import-status" aria-live="polite" className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {message || (selectedFile ? `${selectedFile.name} selected.` : "PDF only, up to 20 MB.")}
      </p>
      {failureMessage && (
        <AiCalendarImportProgress
          state="failed"
          filename={selectedFile?.name}
          elapsedSeconds={elapsedSeconds}
          progress={progress}
          error={failureMessage}
          retryable={failureRetryable}
          onRetry={() => analyzeSelectedFile(false)}
          onContinueManually={() => {
            setStatus("idle");
            setActionResult(null);
            setProgress(getAiImportProgressAfterRetry());
            setElapsedSeconds(0);
          }}
        />
      )}

      {(isWorking || status === "complete") && (
        <AiCalendarImportProgress
          state={status === "complete" ? "complete" : "working"}
          filename={selectedFile?.name}
          elapsedSeconds={elapsedSeconds}
          progress={progress}
        />
      )}

      {importResult && draft.aiImport?.state === "review" && (
        <AiImportReview
          importResult={importResult}
          resolutions={resolutions}
          schedules={schedules}
          onAddTimesNow={onAddTimesNow}
          onResolutionChange={updateResolution}
          warningResolutions={draft.aiImport?.warningResolutions || []}
          onNameChange={updateReviewedName}
          onColorChange={updateScheduleColor}
          onSetupChoiceChange={updateSetupChoice}
          onWarningResolutionChange={updateWarningResolution}
          onRemoveSchedule={removeDetectedSchedule}
          onCreateCalendar={onCreateCalendar}
          onContinueManually={continueManually}
          onAdvancedEdit={applyImport}
          onStartOver={startAiReviewOver}
        />
      )}
    </div>
  );
}

function AiImportReview({
  importResult,
  resolutions,
  schedules,
  onAddTimesNow,
  onResolutionChange,
  warningResolutions,
  onNameChange,
  onColorChange,
  onSetupChoiceChange,
  onWarningResolutionChange,
  onRemoveSchedule,
  onCreateCalendar,
  onContinueManually,
  onAdvancedEdit,
  onStartOver,
}: {
  importResult: AiCalendarImportResult;
  resolutions: DetectedScheduleResolution[];
  schedules: WizardScheduleSummary[];
  onAddTimesNow: (tempId: string, detectedName: string) => Promise<void>;
  onResolutionChange: (tempId: string, existingScheduleId: string) => void;
  warningResolutions: AiImportWarningResolution[];
  onNameChange: (tempId: string, reviewedName: string) => void;
  onColorChange: (tempId: string, calendarColor: string | null) => void;
  onSetupChoiceChange: (
    tempId: string,
    setupChoice: NonNullable<DetectedScheduleResolution["setupChoice"]>
  ) => void;
  onWarningResolutionChange: (
    code: string,
    status: AiImportWarningResolution["status"]
  ) => void;
  onRemoveSchedule: (tempId: string, action: AiScheduleRemovalAction) => void;
  onCreateCalendar: () => Promise<void>;
  onContinueManually: () => void;
  onAdvancedEdit: () => void;
  onStartOver: () => void;
}) {
  const [removalTarget, setRemovalTarget] = useState<{
    tempId: string;
    name: string;
    usage: AiScheduleUsageDetails;
  } | null>(null);
  const [replacementScheduleId, setReplacementScheduleId] = useState("");
  const schedulesNeedingTimes = resolutions.filter(
    (resolution) =>
      !resolution.matchedExistingScheduleId && resolution.status !== "ignored"
  );
  const usageCounts = getDetectedScheduleUsageCounts(importResult);
  const readiness = getAiImportReadinessSummary({
    importResult,
    resolutions,
    warnings: importResult.warnings,
  });
  const warningResolutionMap = new Map(
    warningResolutions.map((resolution) => [resolution.code, resolution])
  );
  const scheduleValidation = resolutions.map((resolution) => ({
    tempId: resolution.tempId,
    ...getScheduleNameValidation(resolution, resolutions, schedules),
  }));
  const scheduleNameErrors = scheduleValidation.filter((item) => item.error);
  const warningReadiness = getAiCreateCalendarReadiness({
    warnings: importResult.warnings,
    warningResolutions,
    scheduleNameErrorCount: scheduleNameErrors.length,
  });
  const canCreateCalendar = warningReadiness.canCreateCalendar;
  const matchedCount = resolutions.filter((resolution) => resolution.matchedExistingScheduleId).length;
  const newScheduleCount = schedulesNeedingTimes.length;

  function requestRemoveSchedule(resolution: DetectedScheduleResolution) {
    const usage = getAiScheduleUsageDetails(importResult, resolution.tempId);
    const name = reviewedScheduleName(resolution);

    if (!usage.isReferenced) {
      onRemoveSchedule(resolution.tempId, { type: "remove_unused" });
      return;
    }

    setRemovalTarget({ tempId: resolution.tempId, name, usage });
    setReplacementScheduleId("");
  }

  function confirmReassign() {
    if (!removalTarget || !replacementScheduleId) return;
    onRemoveSchedule(removalTarget.tempId, {
      type: "reassign",
      replacementScheduleId,
    });
    setRemovalTarget(null);
    setReplacementScheduleId("");
  }

  function confirmNoSchool() {
    if (!removalTarget) return;
    onRemoveSchedule(removalTarget.tempId, { type: "mark_no_school" });
    setRemovalTarget(null);
    setReplacementScheduleId("");
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#242424]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold">Review Your Imported Calendar</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Confirm the detected dates and schedules in one place. Bell times can be added now
            or later.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onContinueManually} className={secondaryButtonClass}>
            Continue Manually
          </button>
          <button type="button" onClick={onStartOver} className={subtleButtonClass}>
            Start Over
          </button>
          <button type="button" onClick={onCreateCalendar} disabled={!canCreateCalendar} className={sundialPrimaryButtonClass("px-5")}>
            Create Calendar
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-6">
        <MetricCard
          label="School year"
          value={`${formatDateForDisplay(importResult.schoolYear.startDate)} - ${formatDateForDisplay(importResult.schoolYear.endDate)}`}
        />
        <MetricCard
          label="Instructional days detected"
          value={String(importResult.expectedInstructionalDayCount || "Review")}
        />
        <MetricCard
          label="No-school ranges"
          value={String(importResult.noSchoolRanges.length)}
        />
        <MetricCard
          label="Special school days"
          value={String(importResult.specialDays.length)}
        />
        <MetricCard
          label="Detected schedules"
          value={`${matchedCount} matched / ${newScheduleCount} new`}
        />
        <MetricCard
          label="Blocking issues"
          value={String(warningReadiness.blockingWarnings.length)}
        />
        <MetricCard
          label="Review items"
          value={String(warningReadiness.reviewWarnings.length)}
        />
      </div>

      {!canCreateCalendar && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
          {scheduleNameErrors.length > 0
            ? "Resolve duplicate or invalid schedule names before creating the calendar."
            : "Fix blocking calendar issues before creating the calendar."}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ReviewPanel title="School Year">
          <ReviewLine label="Dates" value={`${formatDateForDisplay(importResult.schoolYear.startDate)} - ${formatDateForDisplay(importResult.schoolYear.endDate)}`} />
          <ReviewLine label="Confidence" value={confidenceLabel(importResult.schoolYear.confidence)} />
        </ReviewPanel>
        <ReviewPanel title="Calendar Rules">
          <ReviewLine label="Pattern" value={importResult.pattern.type} />
          <ReviewLine label="Confidence" value={confidenceLabel(importResult.pattern.confidence)} />
        </ReviewPanel>
      </div>

      <ReviewPanel title="Detected Schedules" className="mt-4">
        <div className="space-y-3">
          {resolutions.map((resolution) => {
            const matchedSchedule = schedules.find(
              (schedule) => schedule.id === resolution.matchedExistingScheduleId
            );
            const validation = getScheduleNameValidation(resolution, resolutions, schedules);
            const isNewSchedule = !resolution.matchedExistingScheduleId;
            const name = reviewedScheduleName(resolution);

            return (
              <div
                key={resolution.tempId}
                className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700 lg:p-4"
              >
                <div className="grid items-end gap-3 xl:grid-cols-[minmax(220px,1fr)_minmax(260px,0.8fr)_auto]">
                  <label className="block text-sm font-bold">
                    Detected schedule name
                    <input
                      value={name}
                      onChange={(event) => onNameChange(resolution.tempId, event.target.value)}
                      className={`mt-2 ${inputClass}`}
                    />
                  </label>

                  <label className="text-sm font-bold">
                    Match Existing Schedule
                    <select
                      value={resolution.matchedExistingScheduleId || ""}
                      onChange={(event) => onResolutionChange(resolution.tempId, event.target.value)}
                      className={`mt-2 ${inputClass}`}
                    >
                      <option value="">New schedule · Bell times needed</option>
                      {schedules.map((schedule) => (
                        <option key={schedule.id} value={schedule.id}>
                          {schedule.name} · {schedule.periodCount}{" "}
                          {schedule.periodCount === 1 ? "period" : "periods"} ·{" "}
                          {schedule.setupStatus === "ready" ? "Ready" : "Bell times needed"}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    {isNewSchedule && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onSetupChoiceChange(resolution.tempId, "add_now");
                            void onAddTimesNow(resolution.tempId, name || resolution.detectedName);
                          }}
                          className={secondaryButtonClass}
                        >
                          Add Times Now
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetupChoiceChange(resolution.tempId, "add_later")}
                          className={[
                            subtleButtonClass,
                            resolution.setupChoice === "add_later"
                              ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100"
                              : "",
                          ].join(" ")}
                        >
                          Add Times Later
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => requestRemoveSchedule(resolution)}
                      className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-200 dark:hover:bg-red-950/30"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p className="text-xs font-semibold text-slate-500">
                    {detectedScheduleStatusLabel(resolution)} · Used on{" "}
                    {pluralize(usageCounts[resolution.tempId] || 0, "calendar day")}
                  </p>
                  {matchedSchedule && (
                    <span className="text-xs font-semibold text-slate-500">
                      Matched: {matchedSchedule.name} · {matchedSchedule.periodCount}{" "}
                      {matchedSchedule.periodCount === 1 ? "period" : "periods"} ·{" "}
                      {matchedSchedule.setupStatus === "ready" ? "Ready" : "Bell times needed"}
                    </span>
                  )}
                  {isNewSchedule && (
                    <ScheduleColorField
                      name={`calendar_color_${resolution.tempId}`}
                      value={resolution.calendarColor}
                      onChange={(color) => onColorChange(resolution.tempId, color)}
                      label="Calendar color"
                      description="Optional. This color will be used for this new schedule."
                      compact
                    />
                  )}
                  {validation.error && (
                    <p className="basis-full text-xs font-bold text-red-600 dark:text-red-300">
                      {validation.error}
                    </p>
                  )}
                  {!validation.error && validation.warning && (
                    <p className="basis-full text-xs font-bold text-amber-700 dark:text-amber-200">
                      {validation.warning}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ReviewPanel>

      {removalTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 py-8">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-detected-schedule-title"
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#242424]"
          >
            <h3 id="remove-detected-schedule-title" className="text-2xl font-bold">
              Remove detected schedule?
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {removalTarget.name} is used on{" "}
              {pluralize(removalTarget.usage.calendarDayCount, "calendar day")}. Choose what
              should happen to those dates.
            </p>
            {isNoSchoolLikeDetectedScheduleName(removalTarget.name) && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                Recommended: Mark these dates as no-school days.
              </p>
            )}

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-bold">
                Reassign to another schedule
                <select
                  value={replacementScheduleId}
                  onChange={(event) => setReplacementScheduleId(event.target.value)}
                  className={`mt-2 ${inputClass}`}
                >
                  <option value="">Choose a replacement</option>
                  <optgroup label="Detected schedules">
                    {resolutions
                      .filter((resolution) => resolution.tempId !== removalTarget.tempId)
                      .map((resolution) => (
                        <option key={resolution.tempId} value={resolution.tempId}>
                          {reviewedScheduleName(resolution)} · will be created
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Existing Sundial schedules">
                    {schedules.map((schedule) => (
                      <option key={schedule.id} value={schedule.id}>
                        {schedule.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

              <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setRemovalTarget(null)}
                  className={secondaryButtonClass}
                >
                  Cancel
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirmNoSchool}
                    className={secondaryButtonClass}
                  >
                    Mark dates as no school
                  </button>
                  <button
                    type="button"
                    onClick={confirmReassign}
                    disabled={!replacementScheduleId}
                    className={sundialPrimaryButtonClass("px-4")}
                  >
                    Reassign and remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReviewPanel title="Readiness Checklist" className="mt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <ChecklistGroup
            title="Calendar detected"
            items={[
              ["School year confirmed", Boolean(importResult.schoolYear.startDate && importResult.schoolYear.endDate)],
              ["Instructional day count confirmed", Boolean(importResult.expectedInstructionalDayCount)],
              ["Pattern detected", Boolean(importResult.pattern.scheduleTempIds.length)],
              ["No-school days reviewed", true],
              ["Special days reviewed", true],
            ]}
          />
          <ChecklistGroup
            title="Schedule setup"
            items={[
              ...resolutions.map((resolution) => [
                `${reviewedScheduleName(resolution)} ${
                  resolution.matchedExistingScheduleId
                    ? "matched"
                    : "will be created"
                }`,
                true,
              ] as [string, boolean]),
            ]}
          />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Bell times are allowed to remain incomplete. Calendar setup is{" "}
          {readiness.percentComplete}% ready for Phase C creation.
        </p>
      </ReviewPanel>

      {importResult.warnings.length > 0 && (
        <ReviewPanel title="Warnings" className="mt-4">
          <ul className="space-y-3 text-sm font-medium text-slate-600 dark:text-slate-300">
            {importResult.warnings.map((warning) => {
              const resolution = warningResolutionMap.get(warning.code);
              const classification = classifyCalendarWarnings(
                [warning],
                resolution ? [resolution] : []
              );
              const classifiedWarning =
                classification.blockingWarnings[0] ||
                classification.reviewWarnings[0] ||
                classification.informationalWarnings[0];
              const isBlocking = classifiedWarning?.classification === "blocking";
              const severityLabel =
                classifiedWarning?.classification === "informational"
                  ? "informational"
                  : classifiedWarning?.classification || warning.severity;
              return (
                <li key={warning.code} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p>
                    <span className="font-bold">{severityLabel}:</span> {warning.message}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onWarningResolutionChange(warning.code, "accepted_suggestion")}
                      className={[
                        subtleButtonClass,
                        resolution?.status === "accepted_suggestion" ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100" : "",
                      ].join(" ")}
                    >
                      Use suggested correction
                    </button>
                    <button
                      type="button"
                      onClick={() => onWarningResolutionChange(warning.code, "kept_original")}
                      className={[
                        subtleButtonClass,
                        resolution?.status === "kept_original" ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100" : "",
                      ].join(" ")}
                    >
                      Keep original
                    </button>
                    <button
                      type="button"
                      onClick={() => onWarningResolutionChange(warning.code, "edited_manually")}
                      className={[
                        subtleButtonClass,
                        resolution?.status === "edited_manually" ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100" : "",
                      ].join(" ")}
                    >
                      Edit manually
                    </button>
                  </div>
                  {isBlocking && (!resolution || resolution.status === "unreviewed") && (
                    <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-300">
                      This blocking warning must be reviewed before calendar creation.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </ReviewPanel>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ReviewPanel title="No-School Days">
          {importResult.noSchoolRanges.length === 0 ? (
            <p className="text-sm text-slate-500">No no-school days detected.</p>
          ) : (
            importResult.noSchoolRanges.map((range) => (
              <ReviewLine
                key={range.id}
                label={range.label}
                value={`${formatDateRange(range.startDate, range.endDate)} · ${confidenceLabel(range.confidence)}`}
              />
            ))
          )}
        </ReviewPanel>
        <ReviewPanel title="Special School Days">
          {importResult.specialDays.length === 0 ? (
            <p className="text-sm text-slate-500">No special school days detected.</p>
          ) : (
            importResult.specialDays.map((day) => (
              <ReviewLine
                key={day.id}
                label={day.label}
                value={`${formatDateRange(day.startDate, day.endDate)} · ${confidenceLabel(day.confidence)}`}
              />
            ))
          )}
        </ReviewPanel>
      </div>

      <ReviewPanel title="Important Dates" className="mt-4">
        {importResult.informationalDates.length === 0 ? (
          <p className="text-sm text-slate-500">No informational dates detected.</p>
        ) : (
          importResult.informationalDates.map((date) => (
            <ReviewLine
              key={date.id}
              label={date.label}
              value={`${formatDateForDisplay(date.date)} · ${confidenceLabel(date.confidence)}`}
            />
          ))
        )}
      </ReviewPanel>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-700">
        <button type="button" onClick={onAdvancedEdit} className={secondaryButtonClass}>
          Advanced Edit
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onContinueManually} className={secondaryButtonClass}>
            Continue Manually
          </button>
          <button type="button" onClick={onStartOver} className={subtleButtonClass}>
            Start Over
          </button>
          <button type="button" onClick={onCreateCalendar} disabled={!canCreateCalendar} className={sundialPrimaryButtonClass("px-5")}>
            Create Calendar
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 p-4 dark:border-slate-700 ${className}`}>
      <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </h4>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function ChecklistGroup({
  title,
  items,
}: {
  title: string;
  items: Array<[string, boolean]>;
}) {
  return (
    <div>
      <h5 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h5>
      <ul className="mt-3 space-y-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
        {items.map(([label, complete]) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={[
                "grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-black",
                complete
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-200 text-slate-500 dark:bg-slate-800",
              ].join(" ")}
            >
              {complete ? "✓" : "○"}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <span className="text-right font-bold">{value}</span>
    </div>
  );
}

function AiCalendarImportProgress({
  state,
  filename,
  elapsedSeconds,
  progress,
  error,
  retryable = false,
  onRetry,
  onContinueManually,
}: {
  state: "working" | "complete" | "failed";
  filename?: string;
  elapsedSeconds: number;
  progress: number;
  error?: string;
  retryable?: boolean;
  onRetry?: () => void;
  onContinueManually?: () => void;
}) {
  const displayProgress = Math.max(0, Math.min(100, progress));
  const stage = getAiImportStageForProgress(displayProgress);
  const stageLabel = state === "complete" ? "Calendar draft ready" : stage.label;
  const description =
    state === "complete"
      ? "Sundial found calendar details and is opening the review screen."
      : stage.description;
  const reassurance = getAiImportLongRunningMessage(elapsedSeconds);

  return (
    <div
      className={[
        "mt-4 rounded-2xl border p-4 text-sm shadow-sm",
        state === "failed"
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100"
          : "border-amber-200 bg-white text-slate-800 dark:border-amber-900/50 dark:bg-black dark:text-slate-100",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">
            {state === "failed" ? "Calendar analysis stopped" : "Reading your calendar"}
          </p>
          {filename && (
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {filename}
            </p>
          )}
        </div>
        <p className="text-sm font-bold text-[#9A7209] dark:text-[#F6C64A]">
          {displayProgress}%
        </p>
      </div>

      <div
        className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-[#242424]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={displayProgress}
        aria-label="AI calendar import progress"
      >
        <div
          className={[
            "h-full rounded-full bg-[#D4A017]",
            "transition-[width] duration-700 ease-out motion-reduce:transition-none",
            state === "working" && displayProgress >= 92
              ? "animate-pulse motion-reduce:animate-none"
              : "",
          ].join(" ")}
          style={{ width: `${displayProgress}%` }}
        />
      </div>

      <div className="mt-4 grid gap-2">
        <p className="font-bold">{stageLabel}</p>
        <p className="leading-6 text-slate-600 dark:text-slate-300">{description}</p>
        {state === "working" && displayProgress >= 15 && (
          <p className="leading-6 text-slate-600 dark:text-slate-300">
            Processing is still running. This step can take longer for scanned or image-heavy PDFs.
          </p>
        )}
        <p className="font-semibold text-slate-500 dark:text-slate-400">
          Elapsed time: {elapsedSeconds} {elapsedSeconds === 1 ? "second" : "seconds"}
        </p>
        {state === "working" && (
          <p className="leading-6 text-slate-600 dark:text-slate-300">{reassurance}</p>
        )}
        {state === "failed" && error && (
          <p className="font-semibold text-red-800 dark:text-red-200">{error}</p>
        )}
      </div>

      {state === "failed" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {retryable && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-red-800 shadow-sm transition hover:bg-red-100 dark:bg-black dark:text-red-200 dark:hover:bg-red-950/40"
            >
              Retry
            </button>
          )}
          <button type="button" onClick={onContinueManually} className={secondaryButtonClass}>
            Continue Manually
          </button>
        </div>
      )}
    </div>
  );
}

function SchoolYearStep({
  draft,
  errors,
  updateDraft,
}: {
  draft: WizardDraft;
  errors: StepErrors;
  updateDraft: (updater: (draft: WizardDraft) => WizardDraft) => void;
}) {
  const possibleDays = getPossibleOperatingDays(draft);
  const suggestedLabel = suggestSchoolYearLabel(
    draft.schoolYear.startDate,
    draft.schoolYear.endDate
  );
  const lengthWarning =
    possibleDays > 0 && (possibleDays < 120 || possibleDays > 230)
      ? "This is an unusual school-year length. You can continue if this is correct."
      : "";

  function updateSchoolYear(partial: Partial<WizardDraft["schoolYear"]>) {
    updateDraft((previousDraft) => {
      const nextSchoolYear = {
        ...previousDraft.schoolYear,
        ...partial,
      };
      const nextLabel =
        previousDraft.schoolYear.label ||
        suggestSchoolYearLabel(nextSchoolYear.startDate, nextSchoolYear.endDate);
      return {
        ...previousDraft,
        schoolYear: {
          ...nextSchoolYear,
          label: partial.label !== undefined ? partial.label : nextLabel,
        },
      };
    });
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          School Year
        </p>
        <h2 className="mt-2 text-2xl font-bold">Set Up Your School Year</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Choose the first and last student days. Sundial will build the dates in between.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-bold">
            School year label
            <input
              value={draft.schoolYear.label}
              onChange={(event) => updateSchoolYear({ label: event.target.value })}
              placeholder={suggestedLabel || "2026-2027"}
              className={`mt-2 ${inputClass}`}
              aria-describedby={errors.label ? "school-year-label-error" : undefined}
            />
            <ErrorText id="school-year-label-error">{errors.label}</ErrorText>
          </label>
          <div className="hidden sm:block" />
          <label className="block text-sm font-bold">
            First instructional date
            <input
              type="date"
              value={draft.schoolYear.startDate}
              onChange={(event) => updateSchoolYear({ startDate: event.target.value })}
              className={`mt-2 ${inputClass}`}
              aria-describedby={errors.startDate ? "school-year-start-error" : undefined}
            />
            <ErrorText id="school-year-start-error">{errors.startDate}</ErrorText>
          </label>
          <label className="block text-sm font-bold">
            Last instructional date
            <input
              type="date"
              value={draft.schoolYear.endDate}
              onChange={(event) => updateSchoolYear({ endDate: event.target.value })}
              className={`mt-2 ${inputClass}`}
              aria-describedby={errors.endDate ? "school-year-end-error" : undefined}
            />
            <ErrorText id="school-year-end-error">{errors.endDate}</ErrorText>
          </label>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-bold">Days school normally operates</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {WEEKDAYS.map((weekday) => {
              const selected = draft.schoolYear.operatingWeekdays.includes(weekday.value);
              return (
                <button
                  key={weekday.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    updateSchoolYear({
                      operatingWeekdays: selected
                        ? draft.schoolYear.operatingWeekdays.filter((day) => day !== weekday.value)
                        : [...draft.schoolYear.operatingWeekdays, weekday.value].sort(),
                    })
                  }
                  className={[
                    "rounded-full border px-4 py-2 text-sm font-semibold transition",
                    selected
                      ? "border-[#D4A017] bg-[#D4A017] text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-black dark:text-slate-300",
                  ].join(" ")}
                >
                  {weekday.label}
                </button>
              );
            })}
          </div>
          <ErrorText>{errors.operatingWeekdays}</ErrorText>
        </fieldset>
      </div>

      <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-black">
        <h3 className="text-lg font-bold">School year summary</h3>
        <div className="mt-5 space-y-4 text-sm">
          <SummaryRow label="Possible school days" value={String(possibleDays)} />
          <SummaryRow label="First selected day" value={formatDateForDisplay(draft.schoolYear.startDate)} />
          <SummaryRow label="Last selected day" value={formatDateForDisplay(draft.schoolYear.endDate)} />
          <SummaryRow
            label="Selected weekdays"
            value={
              draft.schoolYear.operatingWeekdays
                .map((day) => WEEKDAYS.find((weekday) => weekday.value === day)?.short)
                .filter(Boolean)
                .join(", ") || "None"
            }
          />
        </div>
        {possibleDays > 0 && (
          <p className="mt-5 rounded-xl bg-white p-4 text-sm font-semibold text-slate-700 dark:bg-[#242424] dark:text-slate-200">
            Sundial found {possibleDays} possible school days before holidays and closures.
          </p>
        )}
        {lengthWarning && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
            {lengthWarning}
          </p>
        )}
      </aside>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 last:border-0 dark:border-slate-700">
      <span className="font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-bold">{value}</span>
    </div>
  );
}

function NormalScheduleStep({
  draft,
  schedules,
  scheduleMap,
  adminBasePath,
  onAddTimesNow,
  errors,
  updateDraft,
}: {
  draft: WizardDraft;
  schedules: WizardScheduleSummary[];
  scheduleMap: Map<string, WizardScheduleSummary>;
  adminBasePath: string;
  onAddTimesNow: (tempId: string, detectedName: string) => Promise<void>;
  errors: StepErrors;
  updateDraft: (updater: (draft: WizardDraft) => WizardDraft) => void;
}) {
  const preview = buildPreviewResult(draft);
  const previewDays = preview?.days.filter((calendarDay) => calendarDay.isSchoolDay).slice(0, 10) || [];
  const aiReadiness =
    draft.aiImport?.result
      ? getAiImportReadinessSummary({
          importResult: draft.aiImport.result,
          resolutions: draft.aiImport.resolutions,
          completedSteps: draft.completedSteps,
          warnings: draft.aiImport.warnings || draft.aiImport.result.warnings,
        })
      : null;
  const aiUsageCounts = draft.aiImport?.result
    ? getDetectedScheduleUsageCounts(draft.aiImport.result)
    : {};

  if (schedules.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-bold">What Does a Normal School Week Look Like?</h2>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/60 dark:bg-amber-950/20">
          <h3 className="text-lg font-bold">Create schedules first</h3>
          <p className="mt-2 text-sm leading-6 text-amber-900 dark:text-amber-100">
            You need at least one active schedule before creating a school-year calendar.
            Your wizard draft is saved in this browser session before you leave.
          </p>
          <Link
            href={`${adminBasePath}/schedules/new`}
            className={sundialPrimaryButtonClass("mt-5")}
          >
            Create a Schedule
          </Link>
        </div>
      </div>
    );
  }

  function update(partial: Partial<WizardDraft>) {
    updateDraft((previousDraft) => ({ ...previousDraft, ...partial }));
  }

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Normal Schedule
        </p>
        <h2 className="mt-2 text-2xl font-bold">What Does a Normal School Week Look Like?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Choose how Sundial should assign schedules before special days and closures are applied.
        </p>

        <fieldset className="mt-6 grid gap-3">
          <legend className="sr-only">Normal schedule pattern</legend>
          {[
            ["same", "Every school day uses the same schedule"],
            ["repeating", "We repeat a schedule pattern"],
            ["weekday", "Different weekdays use different schedules"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={draft.patternMode === mode}
              onClick={() => update({ patternMode: mode as PatternMode })}
              className={[
                "rounded-2xl border p-4 text-left transition",
                draft.patternMode === mode
                  ? "border-[#D4A017] bg-amber-50 dark:bg-amber-950/20"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-black",
              ].join(" ")}
            >
              <span className="font-bold">{label}</span>
            </button>
          ))}
        </fieldset>

        <div className="mt-6">
          {draft.aiImport?.result && draft.aiImport.unresolvedRequiredScheduleIds?.length ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <h3 className="text-base font-bold text-amber-950 dark:text-amber-100">
                {draft.aiImport.unresolvedRequiredScheduleIds.length} detected{" "}
                {draft.aiImport.unresolvedRequiredScheduleIds.length === 1
                  ? "schedule needs"
                  : "schedules need"}{" "}
                bell times for the full manual generation path.
              </h3>
              {aiReadiness && (
                <p className="mt-1 text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Calendar setup is {aiReadiness.percentComplete}% complete.
                </p>
              )}
              <div className="mt-3 grid gap-2">
                {draft.aiImport.unresolvedRequiredScheduleIds.map((tempId) => {
                  const resolution = draft.aiImport?.resolutions.find(
                    (item) => item.tempId === tempId
                  );
                  return (
                    <div
                      key={tempId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm dark:bg-black"
                    >
                      <div>
                        <p className="font-bold">{resolution?.detectedName || tempId}</p>
                        <p className="text-xs font-semibold text-slate-500">
                          Used on {pluralize(aiUsageCounts[tempId] || 0, "calendar day")} ·
                          Bell times needed
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void onAddTimesNow(resolution?.tempId || tempId, resolution?.detectedName || tempId)
                        }
                        className={secondaryButtonClass}
                      >
                        Add Times Now
                      </button>
                    </div>
                  );
                })}
              </div>
              {aiReadiness?.remainingTasks.length ? (
                <ul className="mt-3 space-y-1 text-sm font-medium text-amber-900 dark:text-amber-100">
                  {aiReadiness.remainingTasks.slice(0, 5).map((task) => (
                    <li key={task}>Remaining: {task}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {draft.patternMode === "same" && (
            <label className="block text-sm font-bold">
              Schedule used every day
              <ScheduleSelector
                value={draft.sameScheduleId}
                schedules={schedules}
                onChange={(value) => update({ sameScheduleId: value })}
                describedBy={errors.sameScheduleId ? "same-schedule-error" : undefined}
              />
              <ErrorText id="same-schedule-error">{errors.sameScheduleId}</ErrorText>
              <ScheduleSummaryText schedule={scheduleMap.get(draft.sameScheduleId)} />
            </label>
          )}

          {draft.patternMode === "repeating" && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold">Repeating schedule order</h3>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      repeatingScheduleIds: [...draft.repeatingScheduleIds, schedules[0]?.id || ""],
                    })
                  }
                  className={subtleButtonClass}
                >
                  Add Schedule
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {draft.repeatingScheduleIds.map((scheduleId, index) => (
                  <div key={`${index}-${scheduleId}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="grid gap-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
                      <span className="font-bold text-slate-500">{index + 1}</span>
                      <ScheduleSelector
                        value={scheduleId}
                        schedules={schedules}
                        onChange={(value) => {
                          const next = [...draft.repeatingScheduleIds];
                          next[index] = value;
                          update({ repeatingScheduleIds: next });
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={subtleButtonClass}
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...draft.repeatingScheduleIds];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            update({ repeatingScheduleIds: next });
                          }}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className={subtleButtonClass}
                          disabled={index === draft.repeatingScheduleIds.length - 1}
                          onClick={() => {
                            const next = [...draft.repeatingScheduleIds];
                            [next[index + 1], next[index]] = [next[index], next[index + 1]];
                            update({ repeatingScheduleIds: next });
                          }}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className={subtleButtonClass}
                          onClick={() =>
                            update({
                              repeatingScheduleIds: draft.repeatingScheduleIds.filter((_, itemIndex) => itemIndex !== index),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <ErrorText>{errors.repeatingScheduleIds}</ErrorText>
            </div>
          )}

          {draft.patternMode === "weekday" && (
            <div className="space-y-4">
              {draft.schoolYear.operatingWeekdays.map((weekday) => (
                <label key={weekday} className="grid gap-3 text-sm font-bold sm:grid-cols-[10rem_1fr] sm:items-center">
                  <span>{WEEKDAYS.find((day) => day.value === weekday)?.label}</span>
                  <div>
                    <ScheduleSelector
                      value={draft.weekdaySchedules[weekday] || ""}
                      schedules={schedules}
                      onChange={(value) =>
                        update({
                          weekdaySchedules: {
                            ...draft.weekdaySchedules,
                            [weekday]: value,
                          },
                        })
                      }
                    />
                    <ErrorText>{errors[`weekday-${weekday}`]}</ErrorText>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-black">
        <h3 className="text-lg font-bold">Live preview</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          First operating dates before holidays and special days.
        </p>
        <div className="mt-4 space-y-2">
          {previewDays.length === 0 ? (
            <p className="text-sm text-slate-500">Choose school-year dates to preview the pattern.</p>
          ) : (
            previewDays.map((calendarDay) => (
              <div key={calendarDay.date} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm dark:bg-[#242424]">
                <span className="font-semibold">{formatDateForDisplay(calendarDay.date)}</span>
                <span className="inline-flex items-center gap-2 font-bold text-[#9A7209] dark:text-[#F6C64A]">
                  {scheduleMap.get(calendarDay.scheduleId || "") && (
                    <span
                      className="h-3 w-3 rounded-full border"
                      style={getScheduleDotStyle(
                        getScheduleCalendarColor(scheduleMap.get(calendarDay.scheduleId || ""))
                      )}
                      aria-hidden="true"
                    />
                  )}
                  {getScheduleName(scheduleMap, calendarDay.scheduleId)}
                </span>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function NoSchoolDaysStep({
  draft,
  errors,
  updateDraft,
}: {
  draft: WizardDraft;
  errors: StepErrors;
  updateDraft: (updater: (draft: WizardDraft) => WizardDraft) => void;
}) {
  const possibleDays = getPossibleOperatingDays(draft);
  const affectedDays = getNoSchoolAffectedOperatingDays(draft);

  function addEntry(range = false) {
    updateDraft((previousDraft) => ({
      ...previousDraft,
      noSchoolRanges: [
        ...previousDraft.noSchoolRanges,
        {
          id: createId("no-school"),
          startDate: "",
          endDate: "",
          label: "",
          type: range ? "School Break" : "Holiday",
        },
      ],
    }));
  }

  function updateEntry(id: string, partial: Partial<WizardDraft["noSchoolRanges"][number]>) {
    updateDraft((previousDraft) => ({
      ...previousDraft,
      noSchoolRanges: previousDraft.noSchoolRanges.map((range) =>
        range.id === id ? { ...range, ...partial } : range
      ),
    }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Days With No School
          </p>
          <h2 className="mt-2 text-2xl font-bold">Add Days With No School</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Add holidays, breaks, inservice days, or any date when students do not attend.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => addEntry(false)} className={sundialPrimaryButtonClass()}>
            Add a No-School Day
          </button>
          <button type="button" onClick={() => addEntry(true)} className={secondaryButtonClass}>
            Add a Date Range
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <MetricCard label="No-school entries" value={String(draft.noSchoolRanges.length)} />
        <MetricCard label="Affected operating weekdays" value={String(affectedDays)} />
        <MetricCard label="Estimated instructional days" value={String(Math.max(0, possibleDays - affectedDays))} />
      </div>

      <div className="mt-6 space-y-4">
        {draft.noSchoolRanges.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <h3 className="text-lg font-bold">No days added yet</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              We don&apos;t have any days to add right now. You can continue with zero entries.
            </p>
          </div>
        ) : (
          draft.noSchoolRanges.map((range) => (
            <div key={range.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto] lg:items-start">
                <label className="text-sm font-bold">
                  Start date
                  <input
                    type="date"
                    value={range.startDate}
                    onChange={(event) => updateEntry(range.id!, { startDate: event.target.value })}
                    className={`mt-2 ${inputClass}`}
                  />
                  <ErrorText>{errors[`noSchool-${range.id}-start`]}</ErrorText>
                </label>
                <label className="text-sm font-bold">
                  End date
                  <input
                    type="date"
                    value={range.endDate || ""}
                    onChange={(event) =>
                      updateEntry(range.id!, { endDate: event.target.value })
                    }
                    className={`mt-2 ${inputClass}`}
                  />
                  <ErrorText>{errors[`noSchool-${range.id}-end`]}</ErrorText>
                </label>
                <label className="text-sm font-bold">
                  Type
                  <select
                    value={range.type}
                    onChange={(event) => updateEntry(range.id!, { type: event.target.value as NoSchoolType })}
                    className={`mt-2 ${inputClass}`}
                  >
                    {NO_SCHOOL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold">
                  Label
                  <input
                    value={range.label}
                    onChange={(event) => updateEntry(range.id!, { label: event.target.value })}
                    placeholder="Thanksgiving Break"
                    className={`mt-2 ${inputClass}`}
                  />
                  <ErrorText>{errors[`noSchool-${range.id}-label`]}</ErrorText>
                  <ErrorText>{errors[`noSchool-${range.id}-overlap`]}</ErrorText>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    updateDraft((previousDraft) => ({
                      ...previousDraft,
                      noSchoolRanges: previousDraft.noSchoolRanges.filter((entry) => entry.id !== range.id),
                    }))
                  }
                  className={`${subtleButtonClass} lg:mt-7`}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-black">
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function SpecialSchoolDaysStep({
  draft,
  schedules,
  scheduleMap,
  errors,
  updateDraft,
}: {
  draft: WizardDraft;
  schedules: WizardScheduleSummary[];
  scheduleMap: Map<string, WizardScheduleSummary>;
  errors: StepErrors;
  updateDraft: (updater: (draft: WizardDraft) => WizardDraft) => void;
}) {
  function addSpecialDay() {
    updateDraft((previousDraft) => ({
      ...previousDraft,
      specialDays: [
        ...previousDraft.specialDays,
        {
          id: createId("special"),
          type: "Rally",
          startDate: "",
          endDate: "",
          scheduleId: schedules[0]?.id || "",
          label: "",
          isInstructional: true,
          rotationBehavior: "advance",
        },
      ],
    }));
  }

  function updateSpecialDay(id: string, partial: Partial<WizardDraft["specialDays"][number]>) {
    updateDraft((previousDraft) => ({
      ...previousDraft,
      specialDays: previousDraft.specialDays.map((specialDay) =>
        specialDay.id === id ? { ...specialDay, ...partial } : specialDay
      ),
    }));
  }

  function addInfoDate() {
    updateDraft((previousDraft) => ({
      ...previousDraft,
      informationalDates: [
        ...previousDraft.informationalDates,
        { id: createId("info"), date: "", label: "" },
      ],
    }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Special School Days
          </p>
          <h2 className="mt-2 text-2xl font-bold">Add Special School Days</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Add days that use a different schedule, such as rallies, finals, testing, or minimum days.
          </p>
        </div>
        <button type="button" onClick={addSpecialDay} className={sundialPrimaryButtonClass()}>
          Add Special Day
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {draft.specialDays.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <h3 className="text-lg font-bold">No special days added yet</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              You can continue without special school days.
            </p>
          </div>
        ) : (
          draft.specialDays.map((specialDay) => (
            <div key={specialDay.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">
                    {specialDay.label || specialDay.type}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {formatDateRange(specialDay.startDate, specialDay.endDate)} ·{" "}
                    {getScheduleName(scheduleMap, specialDay.scheduleId)}
                  </p>
                </div>
                <button
                  type="button"
                  className={subtleButtonClass}
                  onClick={() =>
                    updateDraft((previousDraft) => ({
                      ...previousDraft,
                      specialDays: previousDraft.specialDays.filter((entry) => entry.id !== specialDay.id),
                    }))
                  }
                >
                  Delete
                </button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <label className="text-sm font-bold">
                  What kind of day is this?
                  <select
                    value={specialDay.type}
                    onChange={(event) => updateSpecialDay(specialDay.id!, { type: event.target.value as SpecialDayType })}
                    className={`mt-2 ${inputClass}`}
                  >
                    {SPECIAL_DAY_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold">
                  Start date
                  <input
                    type="date"
                    value={specialDay.startDate}
                    onChange={(event) => updateSpecialDay(specialDay.id!, { startDate: event.target.value })}
                    className={`mt-2 ${inputClass}`}
                  />
                  <ErrorText>{errors[`special-${specialDay.id}-start`]}</ErrorText>
                </label>
                <label className="text-sm font-bold">
                  End date
                  <input
                    type="date"
                    value={specialDay.endDate || ""}
                    onChange={(event) =>
                      updateSpecialDay(specialDay.id!, { endDate: event.target.value })
                    }
                    className={`mt-2 ${inputClass}`}
                  />
                  <ErrorText>{errors[`special-${specialDay.id}-end`]}</ErrorText>
                </label>
                <label className="text-sm font-bold">
                  Display label
                  <input
                    value={specialDay.label}
                    onChange={(event) => updateSpecialDay(specialDay.id!, { label: event.target.value })}
                    placeholder="Fall Finals"
                    className={`mt-2 ${inputClass}`}
                  />
                  <ErrorText>{errors[`special-${specialDay.id}-label`]}</ErrorText>
                  <ErrorText>{errors[`special-${specialDay.id}-overlap`]}</ErrorText>
                </label>
                <label className="text-sm font-bold">
                  Assigned schedule
                  <ScheduleSelector
                    value={specialDay.scheduleId || ""}
                    schedules={schedules}
                    onChange={(value) => updateSpecialDay(specialDay.id!, { scheduleId: value })}
                  />
                  <ErrorText>{errors[`special-${specialDay.id}-schedule`]}</ErrorText>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold dark:border-slate-700 dark:bg-black lg:mt-7">
                  <input
                    type="checkbox"
                    checked={specialDay.isInstructional}
                    onChange={(event) =>
                      updateSpecialDay(specialDay.id!, {
                        isInstructional: event.target.checked,
                        scheduleId: event.target.checked ? specialDay.scheduleId || schedules[0]?.id || "" : null,
                      })
                    }
                  />
                  Instructional day
                </label>
              </div>

              {specialDay.isInstructional && draft.patternMode === "repeating" && (
                <fieldset className="mt-5">
                  <legend className="text-sm font-bold">
                    After this special day, what should happen to the normal schedule pattern?
                  </legend>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {[
                      ["advance", "Continue normally", "If this is a Brown day, the next school day will be Gold."],
                      ["pause", "Pause the pattern", "The next school day will use the same position in the pattern."],
                      ["restart", "Start over afterward", "The next school day will start again with the first schedule."],
                    ].map(([value, label, body]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={specialDay.rotationBehavior === value}
                        onClick={() =>
                          updateSpecialDay(specialDay.id!, { rotationBehavior: value as RotationBehavior })
                        }
                        className={[
                          "rounded-xl border p-4 text-left transition",
                          specialDay.rotationBehavior === value
                            ? "border-[#D4A017] bg-amber-50 dark:bg-amber-950/20"
                            : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-black",
                        ].join(" ")}
                      >
                        <span className="font-bold">{label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {body}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-black">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Important Dates That Do Not Change the Schedule</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Add quarter ends, graduation, or other informational dates.
            </p>
          </div>
          <button type="button" onClick={addInfoDate} className={secondaryButtonClass}>
            Add Important Date
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {draft.informationalDates.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No informational dates added.</p>
          ) : (
            draft.informationalDates.map((info) => (
              <div key={info.id} className="grid gap-3 rounded-xl bg-white p-3 dark:bg-[#242424] md:grid-cols-[12rem_1fr_auto]">
                <label className="text-sm font-bold">
                  Date
                  <input
                    type="date"
                    value={info.date}
                    onChange={(event) =>
                      updateDraft((previousDraft) => ({
                        ...previousDraft,
                        informationalDates: previousDraft.informationalDates.map((entry) =>
                          entry.id === info.id ? { ...entry, date: event.target.value } : entry
                        ),
                      }))
                    }
                    className={`mt-2 ${inputClass}`}
                  />
                  <ErrorText>{errors[`info-${info.id}-date`]}</ErrorText>
                </label>
                <label className="text-sm font-bold">
                  Label
                  <input
                    value={info.label}
                    onChange={(event) =>
                      updateDraft((previousDraft) => ({
                        ...previousDraft,
                        informationalDates: previousDraft.informationalDates.map((entry) =>
                          entry.id === info.id ? { ...entry, label: event.target.value } : entry
                        ),
                      }))
                    }
                    placeholder="First Quarter Ends"
                    className={`mt-2 ${inputClass}`}
                  />
                  <ErrorText>{errors[`info-${info.id}-label`]}</ErrorText>
                </label>
                <button
                  type="button"
                  className={`${subtleButtonClass} md:mt-7`}
                  onClick={() =>
                    updateDraft((previousDraft) => ({
                      ...previousDraft,
                      informationalDates: previousDraft.informationalDates.filter((entry) => entry.id !== info.id),
                    }))
                  }
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewCalendarStep({
  draft,
  result,
  scheduleMap,
  setCurrentStep,
  onGenerate,
}: {
  draft: WizardDraft;
  result: CalendarGenerationResult | null;
  scheduleMap: Map<string, WizardScheduleSummary>;
  setCurrentStep: (step: WizardStep) => void;
  onGenerate: () => void;
}) {
  if (!result) {
    return (
      <div>
        <h2 className="text-2xl font-bold">Review Your Calendar</h2>
        <p className="mt-3 text-sm text-slate-500">Complete the school-year dates to preview the calendar.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Review Calendar
          </p>
          <h2 className="mt-2 text-2xl font-bold">Review Your Calendar</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Preview the full school year before saving anything to the database.
          </p>
        </div>
        <button type="button" onClick={onGenerate} className={sundialPrimaryButtonClass()}>
          Generate Calendar
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Instructional days" value={String(result.summary.instructionalDayCount)} />
        <MetricCard label="No-school weekdays" value={String(result.summary.noSchoolWeekdayCount)} />
        <MetricCard label="Special school days" value={String(result.summary.specialInstructionalDayCount)} />
        <MetricCard label="Unassigned days" value={String(result.summary.unassignedInstructionalDayCount)} />
        <MetricCard label="Warnings" value={String(result.summary.warningCount)} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {WIZARD_STEPS.slice(0, 4).map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => setCurrentStep(step.id)}
            className={secondaryButtonClass}
          >
            Edit {step.label}
          </button>
        ))}
      </div>

      {result.warnings.length > 0 && (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
          <h3 className="text-lg font-bold text-amber-950 dark:text-amber-100">Needs Attention</h3>
          <ul className="mt-3 space-y-2 text-sm font-medium text-amber-900 dark:text-amber-100">
            {result.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>{warningMessage(warning)}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ScheduleCounts title="Normal Pattern" counts={result.summary.countByBaseSchedule} scheduleMap={scheduleMap} />
        <ScheduleCounts title="Schedules Actually Used" counts={result.summary.countByActualSchedule} scheduleMap={scheduleMap} />
      </div>

      <CalendarYearPreview result={result} scheduleMap={scheduleMap} />

      <p className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:bg-black dark:text-slate-300">
        Review carefully before generating. If matching dates already exist,
        Sundial will ask before replacing anything.
      </p>
      <span className="sr-only">
        Reviewing {draft.schoolYear.label}
      </span>
    </div>
  );
}

function ScheduleCounts({
  title,
  counts,
  scheduleMap,
}: {
  title: string;
  counts: Record<string, number>;
  scheduleMap: Map<string, WizardScheduleSummary>;
}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-black">
      <h3 className="text-lg font-bold">{title}</h3>
      <div className="mt-4 space-y-2">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">No schedules counted yet.</p>
        ) : (
          entries.map(([scheduleId, count]) => (
            <div key={scheduleId} className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 text-sm dark:bg-[#242424]">
              <span className="font-semibold">{getScheduleName(scheduleMap, scheduleId)}</span>
              <span className="font-bold">{count} days</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function scheduleAccent(scheduleId: string | null) {
  if (!scheduleId) return "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-black dark:text-slate-400";
  const palette = [
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100",
    "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-100",
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100",
    "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-violet-100",
  ];
  const sum = scheduleId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

function CalendarYearPreview({
  result,
  scheduleMap,
}: {
  result: CalendarGenerationResult;
  scheduleMap: Map<string, WizardScheduleSummary>;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(result.days[0]?.date || null);
  const selectedDay = selectedDate
    ? result.days.find((calendarDay) => calendarDay.date === selectedDate) || null
    : null;
  const months = useMemo(() => {
    const grouped = new Map<string, GeneratedCalendarDay[]>();
    for (const generatedDay of result.days) {
      const key = generatedDay.date.slice(0, 7);
      grouped.set(key, [...(grouped.get(key) || []), generatedDay]);
    }
    return Array.from(grouped.entries());
  }, [result.days]);

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {months.map(([monthKey, days]) => (
          <MonthPreview
            key={monthKey}
            monthKey={monthKey}
            days={days}
            scheduleMap={scheduleMap}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        ))}
      </section>
      <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-black">
        <h3 className="text-lg font-bold">Date details</h3>
        {!selectedDay ? (
          <p className="mt-3 text-sm text-slate-500">Select a date to inspect it.</p>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            <SummaryRow label="Date" value={formatDateForDisplay(selectedDay.date)} />
            <SummaryRow label="Status" value={selectedDay.isSchoolDay ? "School day" : "No school"} />
            <SummaryRow label="Normal pattern" value={getScheduleName(scheduleMap, selectedDay.baseScheduleId)} />
            <SummaryRow label="Assigned schedule" value={getScheduleName(scheduleMap, selectedDay.scheduleId)} />
            <SummaryRow label="Labels" value={selectedDay.labels.join(", ") || "None"} />
            <SummaryRow
              label="Source"
              value={
                selectedDay.sources.noSchoolRangeIds.length
                  ? "No-school entry"
                  : selectedDay.sources.specialDayIds.length
                    ? "Special school day"
                    : "Normal pattern"
              }
            />
          </div>
        )}
      </aside>
    </div>
  );
}

function MonthPreview({
  monthKey,
  days,
  scheduleMap,
  selectedDate,
  onSelectDate,
}: {
  monthKey: string;
  days: GeneratedCalendarDay[];
  scheduleMap: Map<string, WizardScheduleSummary>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
  const cells: Array<GeneratedCalendarDay | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...days,
  ];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-[#242424]">
      <h3 className="text-center text-base font-bold">{monthLabel}</h3>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[0.68rem] font-bold text-slate-500">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <div key={`${day}-${index}`}>{day}</div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((calendarDay, index) => {
          if (!calendarDay) return <div key={`empty-${index}`} className="min-h-12" />;
          const warning = calendarDay.warningCodes.length > 0;
          return (
            <button
              key={calendarDay.date}
              type="button"
              onClick={() => onSelectDate(calendarDay.date)}
              className={[
                "min-h-12 rounded-lg border p-1 text-left text-[0.68rem] transition focus:outline-none focus:ring-2 focus:ring-[#D4A017]/40",
                calendarDay.isSchoolDay
                  ? scheduleAccent(calendarDay.scheduleId)
                  : "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-black dark:text-slate-500",
                selectedDate === calendarDay.date ? "ring-2 ring-[#D4A017]" : "",
                warning ? "border-red-300" : "",
              ].join(" ")}
              aria-label={`${formatDateForDisplay(calendarDay.date)}, ${
                calendarDay.isSchoolDay ? getScheduleName(scheduleMap, calendarDay.scheduleId) : "No school"
              }`}
            >
              <span className="block font-bold">{Number(calendarDay.date.slice(8, 10))}</span>
              <span className="mt-0.5 block truncate">
                {calendarDay.isSchoolDay
                  ? getScheduleName(scheduleMap, calendarDay.scheduleId)
                  : calendarDay.labels[0] || "No school"}
              </span>
              {warning && <span className="sr-only">Warning on this date</span>}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function GenerateModal({
  result,
  actionResult,
  isSaving,
  onConfirm,
  onReplace,
  onClose,
}: {
  result: CalendarGenerationResult;
  actionResult: GenerateCalendarActionResult | null;
  isSaving: boolean;
  onConfirm: () => void;
  onReplace: () => void;
  onClose: () => void;
}) {
  const replacementRequired =
    actionResult?.status === "replacement_required" ? actionResult : null;
  const errorResult =
    actionResult &&
    actionResult.status !== "replacement_required" &&
    actionResult.status !== "success"
      ? actionResult
      : null;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-calendar-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#242424]"
      >
        <h2 id="generate-calendar-title" className="text-2xl font-bold">
          {replacementRequired
            ? "A calendar already exists for this range"
            : "Generate this calendar?"}
        </h2>
        {replacementRequired ? (
          <div className="mt-3 space-y-4">
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
              This will replace {replacementRequired.existingCount} existing
              calendar days
              {replacementRequired.firstExistingDate && replacementRequired.lastExistingDate
                ? ` from ${formatDateForDisplay(
                    replacementRequired.firstExistingDate
                  )} through ${formatDateForDisplay(
                    replacementRequired.lastExistingDate
                  )}`
                : ""}.
            </p>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-100">
              This pilot replaces all calendar days inside the selected range.
              Manual edits inside that range will not be preserved.
            </div>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Sundial is ready to generate {result.summary.instructionalDayCount} instructional
              days with {result.summary.noSchoolWeekdayCount} no-school weekdays.
            </p>
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-black">
              The server will regenerate this calendar, verify schedule ownership,
              and save only dates that matter to the school calendar.
            </div>
          </>
        )}

        {errorResult && (
          <div
            role="alert"
            className={[
              "mt-5 rounded-xl border p-4 text-sm font-semibold",
              errorResult.status === "server_error" && errorResult.severity === "high"
                ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-100"
                : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100",
            ].join(" ")}
          >
            {errorResult.message}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className={secondaryButtonClass}
          >
            Close
          </button>
          {replacementRequired ? (
            <button
              type="button"
              onClick={onReplace}
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-lg border border-transparent bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Replacing Calendar..." : "Replace Existing Calendar"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSaving}
              className={sundialPrimaryButtonClass()}
            >
              {isSaving ? "Generating Calendar..." : "Generate Calendar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AiCreateCalendarModal({
  importResult,
  resolutions,
  warningResolutions,
  actionResult,
  isSaving,
  onConfirm,
  onReplace,
  onClose,
}: {
  importResult: AiCalendarImportResult;
  resolutions: DetectedScheduleResolution[];
  warningResolutions: AiImportWarningResolution[];
  actionResult: GenerateCalendarActionResult | null;
  isSaving: boolean;
  onConfirm: () => void;
  onReplace: () => void;
  onClose: () => void;
}) {
  const replacementRequired =
    actionResult?.status === "replacement_required" ? actionResult : null;
  const errorResult =
    actionResult &&
    actionResult.status !== "replacement_required" &&
    actionResult.status !== "success"
      ? actionResult
      : null;
  const matchedCount = resolutions.filter(
    (resolution) => resolution.matchedExistingScheduleId
  ).length;
  const schedulesToCreate = resolutions.filter(
    (resolution) => !resolution.matchedExistingScheduleId && resolution.status !== "ignored"
  );
  const warningClassification = classifyCalendarWarnings(
    importResult.warnings,
    warningResolutions
  );
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const hasBlockingWarnings = warningClassification.blockingWarnings.length > 0;
  const needsReviewAcknowledgment =
    !hasBlockingWarnings && warningClassification.unresolvedReviewWarnings.length > 0;
  const canConfirm =
    !isSaving && !hasBlockingWarnings && (!needsReviewAcknowledgment || reviewAcknowledged);
  const validationErrors =
    errorResult?.status === "validation_error" && errorResult.fieldErrors
      ? Object.values(errorResult.fieldErrors)
      : [];
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    scrollRegionRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || []
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/50 px-4 py-4 sm:py-6 lg:py-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-create-calendar-title"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none dark:bg-[#242424]"
      >
        <div className="shrink-0 px-6 pt-6">
          <h2 id="ai-create-calendar-title" className="text-2xl font-bold">
            {replacementRequired
              ? "Replace existing calendar?"
              : "Create imported calendar?"}
          </h2>
        </div>

        <div
          ref={scrollRegionRef}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-3 outline-none"
        >
          {replacementRequired ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                This will replace {replacementRequired.existingCount} existing calendar
                rows for{" "}
                {replacementRequired.firstExistingDate && replacementRequired.lastExistingDate
                  ? `${formatDateForDisplay(
                      replacementRequired.firstExistingDate
                    )} through ${formatDateForDisplay(
                      replacementRequired.lastExistingDate
                    )}`
                  : "the selected school-year range"}
                .
              </p>
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-100">
                Rows outside this range will remain untouched. This operation creates
                schedules and calendar rows together.
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                Sundial will create missing schedules, assign them to imported dates,
                and save the generated calendar for{" "}
                {formatDateForDisplay(importResult.schoolYear.startDate)} through{" "}
                {formatDateForDisplay(importResult.schoolYear.endDate)}.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  label="Instructional days"
                  value={String(importResult.expectedInstructionalDayCount || "Review")}
                />
                <MetricCard label="Schedules to create" value={String(schedulesToCreate.length)} />
                <MetricCard label="Schedules matched" value={String(matchedCount)} />
                <MetricCard label="Need bell times" value={String(schedulesToCreate.length)} />
                <MetricCard
                  label="Blocking issues"
                  value={String(warningClassification.blockingWarnings.length)}
                />
                <MetricCard
                  label="Review items"
                  value={String(warningClassification.reviewWarnings.length)}
                />
                <MetricCard label="No-school ranges" value={String(importResult.noSchoolRanges.length)} />
              </div>

              {schedulesToCreate.length > 0 && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                    {schedulesToCreate.length}{" "}
                    {schedulesToCreate.length === 1 ? "schedule" : "schedules"} will be created
                    without bell times.
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm font-semibold text-amber-900 dark:text-amber-100">
                    {schedulesToCreate.map((resolution) => (
                      <li key={resolution.tempId}>
                        {reviewedScheduleName(resolution)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
                    {schedulesToCreate.map((resolution) => reviewedScheduleName(resolution)).join(", ")}{" "}
                    can be completed later from the Schedules dashboard.
                  </p>
                </div>
              )}

              {hasBlockingWarnings && (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-100">
                  <p className="font-bold">
                    Fix these calendar issues before creating the calendar:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {warningClassification.blockingWarnings.map((warning) => (
                      <li key={warning.code}>{warning.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!hasBlockingWarnings && warningClassification.resolvedReviewWarnings.length > 0 && (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100">
                  {warningClassification.resolvedReviewWarnings.length}{" "}
                  {warningClassification.resolvedReviewWarnings.length === 1 ? "item was" : "items were"}{" "}
                  reviewed and will not prevent calendar creation.
                </div>
              )}

              {needsReviewAcknowledgment && (
                <label className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                  <input
                    type="checkbox"
                    checked={reviewAcknowledged}
                    onChange={(event) => setReviewAcknowledged(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
                  />
                  <span>
                    I reviewed these warnings and want to continue.
                  </span>
                </label>
              )}
            </>
          )}

          {isSaving && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
              Creating schedules and calendar...
            </div>
          )}

          {errorResult && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100"
            >
              <p>{errorResult.message}</p>
              {validationErrors.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {validationErrors.map((message, index) => (
                    <li key={`${message}-${index}`}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 px-6 pb-6 pt-4 dark:border-slate-700">
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className={secondaryButtonClass}
            >
              Close
            </button>
            {replacementRequired ? (
              <button
                type="button"
                onClick={onReplace}
                disabled={isSaving}
                className="inline-flex items-center justify-center rounded-lg border border-transparent bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Creating schedules and calendar..." : "Replace Existing Calendar"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canConfirm}
                className={sundialPrimaryButtonClass()}
              >
                {isSaving ? "Creating schedules and calendar..." : "Create Calendar"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompletionScreen({
  schoolName,
  adminBasePath,
  summary,
}: {
  schoolName: string;
  adminBasePath: string;
  summary: CalendarCompletionSummary;
}) {
  const schedulesNeedingTimes = summary.schedulesNeedingTimes || [];
  const needsBellTimes = schedulesNeedingTimes.length > 0;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-5xl px-5 py-10 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] lg:p-12">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {schoolName} Admin
          </p>
          <div className="mx-auto mt-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
            ✓
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight">
            {needsBellTimes
              ? "Calendar created - Continue to Launch"
              : "Calendar created - Continue to Launch"}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Sundial saved calendar rows for {formatDateForDisplay(summary.startDate)} through{" "}
            {formatDateForDisplay(summary.endDate)}.{" "}
            {needsBellTimes
              ? "Some schedule templates still need bell times, and you can add them later from Dashboard → Schedules."
              : "Your calendar setup is complete and the Launch step is unlocked."}
          </p>

          <div className="mt-8 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Instructional days" value={String(summary.instructionalDayCount)} />
            <MetricCard label="No-school weekdays" value={String(summary.noSchoolWeekdayCount)} />
            <MetricCard label="Special days" value={String(summary.specialInstructionalDayCount)} />
            <MetricCard label="Rows saved" value={String(summary.insertedRowCount)} />
            <MetricCard label="Warnings" value={String(summary.warningCount)} />
          </div>

          {(summary.schedulesCreated?.length ||
            summary.matchedScheduleCount !== undefined ||
            summary.schedulesNeedingTimes?.length) && (
            <div className="mt-4 grid gap-4 text-left sm:grid-cols-3">
              <MetricCard
                label="Schedules created"
                value={String(summary.schedulesCreated?.length || 0)}
              />
              <MetricCard
                label="Schedules matched"
                value={String(summary.matchedScheduleCount || 0)}
              />
              <MetricCard
                label="Need bell times"
                value={String(summary.schedulesNeedingTimes?.length || 0)}
              />
            </div>
          )}

          {needsBellTimes ? (
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left dark:border-amber-900/60 dark:bg-amber-950/20">
              <h2 className="text-lg font-bold text-amber-950 dark:text-amber-100">
                Add bell times when you are ready
              </h2>
              <p className="mt-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
                Your school can launch now. These schedule templates can be completed later
                from Dashboard → Schedules.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {schedulesNeedingTimes.map((schedule) => (
                  <Link
                    key={schedule.id}
                    href={`${adminBasePath}/schedules/${schedule.id}/edit`}
                    className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-amber-950 shadow-sm transition hover:bg-amber-100 dark:bg-black dark:text-amber-100 dark:hover:bg-amber-950/40"
                  >
                    {schedule.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {summary.warnings.length > 0 && (
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left dark:border-amber-900/60 dark:bg-amber-950/20">
              <h2 className="text-lg font-bold text-amber-950 dark:text-amber-100">
                Review notes
              </h2>
              <ul className="mt-3 space-y-2 text-sm font-medium text-amber-900 dark:text-amber-100">
                {summary.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}>{warningMessage(warning)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={`${adminBasePath}/setup/launch`} className={sundialPrimaryButtonClass()}>
              Continue to Launch
            </Link>
            {needsBellTimes && (
              <Link
                href={`${adminBasePath}/schedules/${schedulesNeedingTimes[0].id}/edit`}
                className={secondaryButtonClass}
              >
                Add Bell Times
              </Link>
            )}
            <Link href={`${adminBasePath}/calendar`} className={secondaryButtonClass}>
              View Calendar
            </Link>
            <Link href={adminBasePath} className={secondaryButtonClass}>
              Return to Dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
