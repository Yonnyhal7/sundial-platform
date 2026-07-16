import {
  getAiImportReadinessSummary,
  type AiWizardDraftShape,
  type AiWizardStep,
} from "./aiImportConversion";
import type { AiImportDraftMetadata } from "./aiImportTypes";
import type { Weekday } from "./types";

export const CALENDAR_WIZARD_DRAFT_VERSION = 1;
export const LEGACY_CALENDAR_WIZARD_DRAFT_TYPE = "school_year_calendar";
export const AI_CALENDAR_WIZARD_DRAFT_TYPE = "school_year_calendar_ai";
export const GUIDED_CALENDAR_WIZARD_DRAFT_TYPE = "school_year_calendar_guided";
export const CALENDAR_WIZARD_DRAFT_TYPE = GUIDED_CALENDAR_WIZARD_DRAFT_TYPE;

export const CALENDAR_WIZARD_DRAFT_TYPES = [
  AI_CALENDAR_WIZARD_DRAFT_TYPE,
  GUIDED_CALENDAR_WIZARD_DRAFT_TYPE,
  LEGACY_CALENDAR_WIZARD_DRAFT_TYPE,
] as const;

export type CalendarWizardDraftType = (typeof CALENDAR_WIZARD_DRAFT_TYPES)[number];
export type CalendarWizardFlowType = "ai" | "guided";

export function getDraftTypeForCalendarWizardFlow(
  flow: CalendarWizardFlowType
): CalendarWizardDraftType {
  return flow === "ai"
    ? AI_CALENDAR_WIZARD_DRAFT_TYPE
    : GUIDED_CALENDAR_WIZARD_DRAFT_TYPE;
}

export function getCalendarWizardFlowForDraft(
  data: CalendarWizardStoredData
): CalendarWizardFlowType {
  return data.draft.aiImport?.result ? "ai" : "guided";
}

export const CALENDAR_WIZARD_STEPS = [
  "school-year",
  "normal-schedule",
  "no-school",
  "special-days",
  "review",
] as const satisfies readonly AiWizardStep[];

export type CalendarWizardStoredData = {
  version: 1;
  currentStep: AiWizardStep;
  draft: AiWizardDraftShape;
  savedAt: string;
};

export type CalendarWizardDraftSummary = {
  schoolYearLabel: string | null;
  completionPercentage: number;
  remainingScheduleCount: number;
  remainingTasks: string[];
};

export type CalendarWizardDraftRecord = {
  id: string;
  school_id: string;
  draft_type: string;
  school_year_label: string | null;
  wizard_data: CalendarWizardStoredData;
  created_at: string;
  updated_at: string;
};

export type SerializedCalendarWizardDraft = {
  data: CalendarWizardStoredData;
  summary: CalendarWizardDraftSummary;
};

const unsafeKeyPattern =
  /^(pdf|pdfBytes|base64|rawOpenAi|rawResponse|responseEnvelope|openAiFileId|file_id|fileId)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function isWizardStep(value: unknown): value is AiWizardStep {
  return typeof value === "string" && CALENDAR_WIZARD_STEPS.includes(value as AiWizardStep);
}

function stripUnsafeValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsafeValues);
  }

  if (!isRecord(value)) {
    if (
      typeof value === "string" &&
      (value.startsWith("data:application/pdf") ||
        value.startsWith("%PDF-") ||
        value.length > 250_000)
    ) {
      return undefined;
    }
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !unsafeKeyPattern.test(key))
      .map(([key, item]) => [key, stripUnsafeValues(item)])
      .filter(([, item]) => item !== undefined)
  );
}

function normalizeRange<T extends { startDate: string; endDate?: string | null }>(range: T) {
  return {
    ...range,
    endDate: range.endDate || range.startDate,
  };
}

function normalizeAiImport(aiImport: unknown): AiImportDraftMetadata | null {
  if (!isRecord(aiImport)) return null;
  const stripped = stripUnsafeValues(aiImport) as Partial<AiImportDraftMetadata>;

  return {
    state: typeof stripped.state === "string" ? stripped.state : "idle",
    fileName: typeof stripped.fileName === "string" ? stripped.fileName : undefined,
    result: stripped.result
      ? {
          ...stripped.result,
          noSchoolRanges: Array.isArray(stripped.result.noSchoolRanges)
            ? stripped.result.noSchoolRanges.map(normalizeRange)
            : [],
          specialDays: Array.isArray(stripped.result.specialDays)
            ? stripped.result.specialDays.map(normalizeRange)
            : [],
        }
      : undefined,
    resolutions: Array.isArray(stripped.resolutions) ? stripped.resolutions : [],
    appliedAt: typeof stripped.appliedAt === "string" ? stripped.appliedAt : undefined,
    banner: typeof stripped.banner === "string" ? stripped.banner : undefined,
    pdfHash:
      typeof stripped.pdfHash === "string" && /^[0-9a-f]{64}$/i.test(stripped.pdfHash)
        ? stripped.pdfHash
        : undefined,
    cacheHit: stripped.cacheHit === true,
    cacheAnalyzedAt:
      typeof stripped.cacheAnalyzedAt === "string"
        ? stripped.cacheAnalyzedAt
        : undefined,
    cacheStrategy:
      stripped.cacheStrategy === "text-gpt5-mini" || stripped.cacheStrategy === "pdf-gpt5"
        ? stripped.cacheStrategy
        : undefined,
    analysisVersion:
      typeof stripped.analysisVersion === "string"
        ? stripped.analysisVersion
        : undefined,
    analysisAttemptId:
      typeof stripped.analysisAttemptId === "string"
        ? stripped.analysisAttemptId
        : undefined,
    unresolvedRequiredScheduleIds: Array.isArray(stripped.unresolvedRequiredScheduleIds)
      ? stripped.unresolvedRequiredScheduleIds.filter(
          (id): id is string => typeof id === "string"
        )
      : [],
    removedSchedules: Array.isArray(stripped.removedSchedules)
      ? stripped.removedSchedules.filter(isRecord).map((removed) => {
          const action: "removed" | "reassigned" | "marked_no_school" =
            removed.action === "reassigned" || removed.action === "marked_no_school"
              ? removed.action
              : "removed";

          return {
            tempId: typeof removed.tempId === "string" ? removed.tempId : "",
            name: typeof removed.name === "string" ? removed.name : "",
            removedAt: typeof removed.removedAt === "string" ? removed.removedAt : "",
            action,
            affectedDayCount:
              typeof removed.affectedDayCount === "number"
                ? removed.affectedDayCount
                : undefined,
          };
        }).filter((removed) => removed.tempId && removed.name)
      : [],
    warnings: Array.isArray(stripped.warnings) ? stripped.warnings : [],
    warningResolutions: Array.isArray(stripped.warningResolutions)
      ? stripped.warningResolutions
      : [],
  } satisfies AiImportDraftMetadata;
}

function migrateDraftShape(value: unknown): AiWizardDraftShape | null {
  if (!isRecord(value)) return null;

  const schoolYear = isRecord(value.schoolYear) ? value.schoolYear : {};
  const operatingWeekdays: Weekday[] = Array.isArray(schoolYear.operatingWeekdays)
    ? schoolYear.operatingWeekdays.filter(isWeekday)
    : [1, 2, 3, 4, 5];

  const draft: AiWizardDraftShape = {
    schoolYear: {
      label: typeof schoolYear.label === "string" ? schoolYear.label : "",
      startDate: typeof schoolYear.startDate === "string" ? schoolYear.startDate : "",
      endDate: typeof schoolYear.endDate === "string" ? schoolYear.endDate : "",
      operatingWeekdays: operatingWeekdays.length ? operatingWeekdays : [1, 2, 3, 4, 5],
    },
    patternMode:
      value.patternMode === "repeating" || value.patternMode === "weekday"
        ? value.patternMode
        : "same",
    sameScheduleId: typeof value.sameScheduleId === "string" ? value.sameScheduleId : "",
    repeatingScheduleIds: Array.isArray(value.repeatingScheduleIds)
      ? value.repeatingScheduleIds.filter((id): id is string => typeof id === "string")
      : [],
    weekdaySchedules: isRecord(value.weekdaySchedules)
      ? Object.fromEntries(
          Object.entries(value.weekdaySchedules).filter(
            ([weekday, scheduleId]) => Number.isInteger(Number(weekday)) && typeof scheduleId === "string"
          )
        )
      : {},
    noSchoolRanges: Array.isArray(value.noSchoolRanges)
      ? value.noSchoolRanges.filter(isRecord).map((range) =>
          normalizeRange({
            id: typeof range.id === "string" ? range.id : undefined,
            startDate: typeof range.startDate === "string" ? range.startDate : "",
            endDate: typeof range.endDate === "string" ? range.endDate : null,
            label: typeof range.label === "string" ? range.label : "",
            type: typeof range.type === "string" ? range.type : "No School",
          })
        )
      : [],
    specialDays: Array.isArray(value.specialDays)
      ? value.specialDays.filter(isRecord).map((day) =>
          normalizeRange({
            id: typeof day.id === "string" ? day.id : undefined,
            startDate: typeof day.startDate === "string" ? day.startDate : "",
            endDate: typeof day.endDate === "string" ? day.endDate : null,
            scheduleId: typeof day.scheduleId === "string" ? day.scheduleId : null,
            label: typeof day.label === "string" ? day.label : "",
            type: typeof day.type === "string" ? day.type : "Custom",
            isInstructional: typeof day.isInstructional === "boolean" ? day.isInstructional : true,
            rotationBehavior:
              day.rotationBehavior === "pause" || day.rotationBehavior === "restart"
                ? day.rotationBehavior
                : "advance",
          })
        )
      : [],
    informationalDates: Array.isArray(value.informationalDates)
      ? value.informationalDates.filter(isRecord).map((info) => ({
          id: typeof info.id === "string" ? info.id : "",
          date: typeof info.date === "string" ? info.date : "",
          label: typeof info.label === "string" ? info.label : "",
        }))
      : [],
    completedSteps: Array.isArray(value.completedSteps)
      ? value.completedSteps.filter(isWizardStep)
      : [],
    aiImport: normalizeAiImport(value.aiImport),
  };

  return draft;
}

export function migrateCalendarWizardStoredData(value: unknown): CalendarWizardStoredData | null {
  if (!isRecord(value)) return null;
  if ("draft" in value && !isRecord(value.draft)) return null;

  const rawDraft = isRecord(value.draft) ? value.draft : value;
  const draft = migrateDraftShape(rawDraft);
  if (!draft) return null;

  return {
    version: CALENDAR_WIZARD_DRAFT_VERSION,
    currentStep: isWizardStep(value.currentStep) ? value.currentStep : "school-year",
    draft,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date().toISOString(),
  };
}

export function summarizeCalendarWizardDraft(data: CalendarWizardStoredData): CalendarWizardDraftSummary {
  const importResult = data.draft.aiImport?.result;
  const readiness = importResult
    ? getAiImportReadinessSummary({
        importResult,
        resolutions: data.draft.aiImport?.resolutions || [],
        completedSteps: data.draft.completedSteps,
        warnings: data.draft.aiImport?.warnings || importResult.warnings,
      })
    : null;

  return {
    schoolYearLabel: data.draft.schoolYear.label || null,
    completionPercentage:
      readiness?.percentComplete ??
      Math.round((data.draft.completedSteps.length / CALENDAR_WIZARD_STEPS.length) * 100),
    remainingScheduleCount: data.draft.aiImport?.unresolvedRequiredScheduleIds?.length || 0,
    remainingTasks: readiness?.remainingTasks || [],
  };
}

export function serializeCalendarWizardDraft(value: unknown): SerializedCalendarWizardDraft | null {
  const data = migrateCalendarWizardStoredData(stripUnsafeValues(value));
  if (!data) return null;

  return {
    data,
    summary: summarizeCalendarWizardDraft(data),
  };
}

export function chooseCalendarWizardDraftSource({
  databaseUpdatedAt,
  sessionUpdatedAt,
}: {
  databaseUpdatedAt?: string | null;
  sessionUpdatedAt?: string | null;
}) {
  if (!databaseUpdatedAt && !sessionUpdatedAt) return "none";
  if (databaseUpdatedAt && !sessionUpdatedAt) return "database";
  if (!databaseUpdatedAt && sessionUpdatedAt) return "session";

  return new Date(sessionUpdatedAt!).getTime() > new Date(databaseUpdatedAt!).getTime()
    ? "session"
    : "database";
}

export function shouldDebouncedSave(previous: unknown, next: unknown) {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

export function getInitialCalendarWizardHydrationState() {
  return {
    currentStep: "school-year" as const,
    draftLoading: true,
    shouldRenderProgress: false,
  };
}

export function shouldRenderWizardProgress(draftLoading: boolean) {
  return !draftLoading;
}
