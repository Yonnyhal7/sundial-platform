import type { AiCalendarImportResult } from "./aiImportTypes";
import type {
  CalendarGenerationResult,
  CalendarWizardConfig,
  Weekday,
} from "./types";

export type AiPreviewScheduleSummary = {
  id: string;
  name: string;
};

export function buildAiPreviewConfig(
  importResult: AiCalendarImportResult
): CalendarWizardConfig {
  const pattern =
    importResult.pattern.type === "same"
      ? {
          type: "same" as const,
          scheduleId: importResult.pattern.scheduleTempIds[0] || "",
        }
      : importResult.pattern.type === "weekday"
        ? {
            type: "weekday" as const,
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
            type: "repeating" as const,
            scheduleIds: importResult.pattern.scheduleTempIds,
          };

  return {
    schoolYear: {
      name: importResult.schoolYear.label,
      startDate: importResult.schoolYear.startDate,
      endDate: importResult.schoolYear.endDate,
    },
    operatingWeekdays: importResult.schoolYear.operatingWeekdays,
    pattern,
    noSchoolRanges: importResult.noSchoolRanges,
    specialDays: importResult.specialDays.map((day) => ({
      ...day,
      scheduleId: day.isInstructional ? day.scheduleTempId || null : null,
      rotationBehavior: "pause",
    })),
    informationalDates: importResult.informationalDates,
  };
}

export function hasBrownGoldVerificationScheduleSet(
  scheduleMap: Map<string, AiPreviewScheduleSummary>
) {
  const scheduleNames = [...scheduleMap.values()].map((schedule) =>
    schedule.name.toLowerCase()
  );
  return (
    scheduleNames.some((name) => name.includes("brown")) &&
    scheduleNames.some((name) => name.includes("gold")) &&
    scheduleNames.some((name) => name.includes("all period"))
  );
}

function getScheduleName(
  scheduleMap: Map<string, AiPreviewScheduleSummary>,
  id: string | null
) {
  if (!id) return "No schedule";
  return scheduleMap.get(id)?.name || "Unknown schedule";
}

export function getBrownGoldVerificationRows(
  result: CalendarGenerationResult,
  scheduleMap: Map<string, AiPreviewScheduleSummary>
) {
  const expected = [
    ["2026-08-12", "all period"],
    ["2026-08-13", "brown"],
    ["2026-08-14", "gold"],
    ["2026-08-17", "brown"],
    ["2026-08-18", "gold"],
    ["2026-08-19", "brown"],
    ["2026-08-20", "gold"],
    ["2026-08-21", "brown"],
  ] as const;

  return expected.map(([date, expectedName]) => {
    const day = result.days.find((calendarDay) => calendarDay.date === date);
    const actual = getScheduleName(scheduleMap, day?.scheduleId || null);
    return {
      date,
      expected: expectedName,
      actual,
      matches: actual.toLowerCase().includes(expectedName),
    };
  });
}

export function getBrownGoldVerificationConflicts(
  result: CalendarGenerationResult,
  scheduleMap: Map<string, AiPreviewScheduleSummary>
) {
  if (!hasBrownGoldVerificationScheduleSet(scheduleMap)) return [];
  return getBrownGoldVerificationRows(result, scheduleMap).filter(
    (row) => !row.matches
  );
}
