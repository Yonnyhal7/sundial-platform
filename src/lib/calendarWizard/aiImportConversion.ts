import type {
  AiCalendarImportResult,
  AiImportDraftMetadata,
  DetectedScheduleResolution,
  AiImportWarning,
} from "./aiImportTypes";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import type { CalendarWizardConfig, Weekday } from "./types";

export type AiWizardStep =
  | "school-year"
  | "normal-schedule"
  | "no-school"
  | "special-days"
  | "review";

export type AiWizardDraftShape = {
  schoolYear: {
    label: string;
    startDate: string;
    endDate: string;
    operatingWeekdays: Weekday[];
  };
  patternMode: "same" | "repeating" | "weekday";
  sameScheduleId: string;
  repeatingScheduleIds: string[];
  weekdaySchedules: Partial<Record<Weekday, string>>;
  noSchoolRanges: Array<{
    id?: string;
    startDate: string;
    endDate: string;
    label: string;
    type: string;
  }>;
  specialDays: Array<{
    id?: string;
    startDate: string;
    endDate: string;
    scheduleId: string | null;
    label: string;
    type: string;
    isInstructional: boolean;
    rotationBehavior: "advance" | "pause" | "restart";
  }>;
  informationalDates: Array<{ id: string; date: string; label: string }>;
  completedSteps: AiWizardStep[];
  aiImport?: AiImportDraftMetadata | null;
};

export type AiImportConversionResult<TDraft extends AiWizardDraftShape = AiWizardDraftShape> = {
  draft: TDraft;
  earliestStep: AiWizardStep;
  unresolvedRequiredScheduleIds: string[];
};

function resolutionMap(resolutions: DetectedScheduleResolution[]) {
  return new Map(resolutions.map((resolution) => [resolution.tempId, resolution]));
}

function scheduleIdFor(
  tempId: string | undefined,
  resolutionsByTempId: Map<string, DetectedScheduleResolution>
) {
  if (!tempId) return null;
  const resolution = resolutionsByTempId.get(tempId);
  if (!resolution || resolution.status === "ignored") return null;
  return resolution.matchedExistingScheduleId || null;
}

function getUnresolvedRequiredScheduleIds(
  importResult: AiCalendarImportResult,
  resolutions: DetectedScheduleResolution[]
) {
  const resolutionsByTempId = resolutionMap(resolutions);
  const required = new Set(importResult.pattern.scheduleTempIds);

  for (const specialDay of importResult.specialDays) {
    if (specialDay.isInstructional && specialDay.scheduleTempId) {
      required.add(specialDay.scheduleTempId);
    }
  }
  for (const assignment of importResult.datedScheduleAssignments || []) {
    required.add(assignment.scheduleTempId);
  }

  return [...required].filter((tempId) => !scheduleIdFor(tempId, resolutionsByTempId));
}

export function getRequiredDetectedScheduleIds(importResult: AiCalendarImportResult) {
  const required = new Set(importResult.pattern.scheduleTempIds);

  for (const specialDay of importResult.specialDays) {
    if (specialDay.isInstructional && specialDay.scheduleTempId) {
      required.add(specialDay.scheduleTempId);
    }
  }
  for (const assignment of importResult.datedScheduleAssignments || []) {
    required.add(assignment.scheduleTempId);
  }

  return [...required];
}

export function getDetectedScheduleUsageCounts(importResult: AiCalendarImportResult) {
  const config: CalendarWizardConfig = {
    schoolYear: {
      name: importResult.schoolYear.label,
      startDate: importResult.schoolYear.startDate,
      endDate: importResult.schoolYear.endDate,
    },
    operatingWeekdays: importResult.schoolYear.operatingWeekdays,
    pattern:
      importResult.pattern.type === "same"
        ? {
            type: "same",
            scheduleId: importResult.pattern.scheduleTempIds[0] || "",
          }
        : importResult.pattern.type === "weekday"
          ? {
              type: "weekday",
              schedulesByWeekday: Object.fromEntries(
                importResult.schoolYear.operatingWeekdays.map((weekday, index) => [
                  weekday,
                  importResult.pattern.scheduleTempIds[index] ||
                    importResult.pattern.scheduleTempIds[0] ||
                    "",
                ])
              ) as Partial<Record<Weekday, string>>,
            }
          : {
              type: "repeating",
              scheduleIds: importResult.pattern.scheduleTempIds,
            },
    noSchoolRanges: importResult.noSchoolRanges,
    specialDays: importResult.specialDays.map((day) => ({
      ...day,
      scheduleId: day.isInstructional ? day.scheduleTempId || null : null,
    })),
    datedScheduleAssignments: (importResult.datedScheduleAssignments || []).map((assignment) => ({
      id: assignment.id,
      date: assignment.date,
      scheduleId: assignment.scheduleTempId,
      source: assignment.source,
      confidence: assignment.confidence,
      label: assignment.scheduleName,
      rotationBehavior: assignment.rotationBehavior,
    })),
    informationalDates: importResult.informationalDates,
  };

  return generateSchoolYearCalendar(config).summary.countByActualSchedule;
}

export type AiImportReadinessSummary = {
  percentComplete: number;
  completedTaskCount: number;
  totalTaskCount: number;
  remainingTasks: string[];
};

export function getAiImportReadinessSummary({
  importResult,
  resolutions,
  completedSteps = [],
  warnings = importResult.warnings,
}: {
  importResult: AiCalendarImportResult;
  resolutions: DetectedScheduleResolution[];
  completedSteps?: AiWizardStep[];
  warnings?: AiImportWarning[];
}): AiImportReadinessSummary {
  const requiredScheduleIds = getRequiredDetectedScheduleIds(importResult);
  const resolutionsByTempId = resolutionMap(resolutions);
  const tasks: Array<{ complete: boolean; remainingLabel: string }> = [
    {
      complete: completedSteps.includes("school-year"),
      remainingLabel: "Confirm the school year dates",
    },
    {
      complete: completedSteps.includes("normal-schedule"),
      remainingLabel: "Confirm the normal schedule pattern",
    },
    {
      complete: completedSteps.includes("no-school"),
      remainingLabel: "Review no-school dates",
    },
    {
      complete: completedSteps.includes("special-days"),
      remainingLabel: "Review special schedule days",
    },
    ...requiredScheduleIds.map((tempId) => {
      const resolution = resolutionsByTempId.get(tempId);
      return {
        complete: Boolean(resolution?.matchedExistingScheduleId) || resolution?.setupChoice === "add_later",
        remainingLabel: `Confirm ${resolution?.reviewedName || resolution?.detectedName || tempId}`,
      };
    }),
    ...warnings.map((warning) => ({
      complete:
        completedSteps.includes("review") ||
        warning.severity !== "blocking",
      remainingLabel: `Review ${warning.message}`,
    })),
  ];

  const totalTaskCount = Math.max(tasks.length, 1);
  const completedTaskCount = tasks.filter((task) => task.complete).length;

  return {
    percentComplete: Math.round((completedTaskCount / totalTaskCount) * 100),
    completedTaskCount,
    totalTaskCount,
    remainingTasks: tasks
      .filter((task) => !task.complete)
      .map((task) => task.remainingLabel),
  };
}

function hasReviewConfidence(importResult: AiCalendarImportResult) {
  return (
    importResult.schoolYear.confidence !== "high" ||
    importResult.pattern.confidence !== "high"
  );
}

export function convertAiImportToWizardDraft<TDraft extends AiWizardDraftShape>(
  currentDraft: TDraft,
  importResult: AiCalendarImportResult,
  resolutions: DetectedScheduleResolution[],
  fileName?: string
): AiImportConversionResult<TDraft> {
  const resolutionsByTempId = resolutionMap(resolutions);
  const unresolvedRequiredScheduleIds = getUnresolvedRequiredScheduleIds(
    importResult,
    resolutions
  );
  const resolvedPatternIds = importResult.pattern.scheduleTempIds
    .map((tempId) => scheduleIdFor(tempId, resolutionsByTempId))
    .filter((scheduleId): scheduleId is string => Boolean(scheduleId));

  const firstResolvedScheduleId = resolvedPatternIds[0] || "";
  const weekdaySchedules = { ...currentDraft.weekdaySchedules };
  for (const weekday of importResult.schoolYear.operatingWeekdays) {
    weekdaySchedules[weekday] = firstResolvedScheduleId;
  }

  const specialDays = importResult.specialDays.map((specialDay) => ({
    id: specialDay.id,
    startDate: specialDay.startDate,
    endDate: specialDay.endDate,
    scheduleId: specialDay.isInstructional
      ? scheduleIdFor(specialDay.scheduleTempId, resolutionsByTempId)
      : null,
    label: specialDay.label,
    type: normalizeSpecialDayType(specialDay.type),
    isInstructional: specialDay.isInstructional,
    rotationBehavior: specialDay.rotationBehavior || ("pause" as const),
  }));

  const completedSteps: AiWizardStep[] = ["school-year", "no-school", "special-days"];
  if (unresolvedRequiredScheduleIds.length === 0 && resolvedPatternIds.length > 0) {
    completedSteps.push("normal-schedule");
  }

  const earliestStep: AiWizardStep =
    hasReviewConfidence(importResult)
        ? "school-year"
        : "review";

  return {
    draft: {
      ...currentDraft,
      schoolYear: {
        label: importResult.schoolYear.label || currentDraft.schoolYear.label,
        startDate: importResult.schoolYear.startDate,
        endDate: importResult.schoolYear.endDate,
        operatingWeekdays: importResult.schoolYear.operatingWeekdays,
      },
      patternMode: importResult.pattern.type,
      sameScheduleId: firstResolvedScheduleId,
      repeatingScheduleIds: importResult.pattern.type === "repeating" ? resolvedPatternIds : [],
      weekdaySchedules,
      noSchoolRanges: importResult.noSchoolRanges.map((range) => ({
        id: range.id,
        startDate: range.startDate,
        endDate: range.endDate,
        label: range.label,
        type: normalizeNoSchoolType(range.type),
      })),
      specialDays,
      informationalDates: importResult.informationalDates.map((date) => ({
        id: date.id,
        date: date.date,
        label: date.label,
      })),
      completedSteps,
      aiImport: {
        state: "applied",
        fileName,
        result: importResult,
        resolutions,
        appliedAt: new Date().toISOString(),
        banner: "AI import added. Review the highlighted items before generating your calendar.",
        unresolvedRequiredScheduleIds,
        warnings: importResult.warnings,
      },
    },
    earliestStep,
    unresolvedRequiredScheduleIds,
  };
}

export function unresolvedRequiredSchedulesBlockFinalReadiness(
  draft: Pick<AiWizardDraftShape, "aiImport">
) {
  return Boolean(draft.aiImport?.unresolvedRequiredScheduleIds?.length);
}

export function clearAiImportMetadata<TDraft extends { aiImport?: AiImportDraftMetadata | null }>(
  draft: TDraft
) {
  return {
    ...draft,
    aiImport: null,
  };
}

function normalizeNoSchoolType(type: string | undefined) {
  const allowed = new Set([
    "Holiday",
    "School Break",
    "Teacher Work Day",
    "Inservice Day",
    "District Closed",
    "No School",
    "Custom",
  ]);
  return type && allowed.has(type) ? type : "No School";
}

function normalizeSpecialDayType(type: string | undefined) {
  const allowed = new Set([
    "First Day",
    "Rally",
    "Finals",
    "Testing",
    "Minimum Day",
    "All Periods",
    "Early Release",
    "School Event",
    "Custom",
  ]);
  return type && allowed.has(type) ? type : "Custom";
}
