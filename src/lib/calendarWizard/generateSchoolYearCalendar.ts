import {
  clampRangeToBounds,
  compareDateStrings,
  eachDateInRange,
  getWeekday,
  rangesOverlap,
} from "./dateUtils";
import type {
  CalendarGenerationResult,
  CalendarGenerationSummary,
  CalendarGenerationWarning,
  CalendarGenerationWarningCode,
  CalendarWizardConfig,
  DateString,
  GeneratedCalendarDay,
  InformationalDate,
  NoSchoolRange,
  RotationBehavior,
  SpecialSchoolDay,
  Weekday,
} from "./types";

type NormalizedRange<T> = T & {
  id: string;
  startDate: DateString;
  endDate: DateString;
};

type ExpandedSpecialDay = NormalizedRange<SpecialSchoolDay> & {
  isInstructional: boolean;
  rotationBehavior: RotationBehavior;
};

function createEmptySummary(): CalendarGenerationSummary {
  return {
    totalDatesInRange: 0,
    instructionalDayCount: 0,
    noSchoolWeekdayCount: 0,
    weekendOrNonOperatingDayCount: 0,
    countByBaseSchedule: {},
    countByActualSchedule: {},
    specialInstructionalDayCount: 0,
    unassignedInstructionalDayCount: 0,
    warningCount: 0,
  };
}

function addWarning(
  warnings: CalendarGenerationWarning[],
  code: CalendarGenerationWarningCode,
  message: string,
  details: Omit<CalendarGenerationWarning, "code" | "message"> = {}
) {
  warnings.push({ code, message, ...details });
}

function normalizeRange<T extends { id?: string; startDate: DateString; endDate?: DateString }>(
  range: T,
  index: number,
  prefix: string
): NormalizedRange<T> {
  return {
    ...range,
    id: range.id || `${prefix}-${index + 1}`,
    endDate: range.endDate || range.startDate,
  };
}

function isRangeOutsideYear(
  range: { startDate: DateString; endDate: DateString },
  startDate: DateString,
  endDate: DateString
) {
  return (
    compareDateStrings(range.endDate, startDate) < 0 ||
    compareDateStrings(range.startDate, endDate) > 0
  );
}

function addLabels(target: string[], labels: Array<string | null | undefined>) {
  for (const label of labels) {
    const trimmed = label?.trim();

    if (trimmed && !target.includes(trimmed)) {
      target.push(trimmed);
    }
  }
}

function incrementCount(counts: Record<string, number>, key: string | null) {
  if (!key) return;
  counts[key] = (counts[key] || 0) + 1;
}

function getNormalScheduleId(
  config: CalendarWizardConfig,
  weekday: Weekday,
  repeatingIndex: number,
  warnings: CalendarGenerationWarning[],
  warningCodes: CalendarGenerationWarningCode[]
) {
  if (config.pattern.type === "same") {
    return config.pattern.scheduleId || null;
  }

  if (config.pattern.type === "weekday") {
    const scheduleId = config.pattern.schedulesByWeekday[weekday] || null;

    if (!scheduleId) {
      const code = "weekday_pattern_missing_schedule";
      warningCodes.push(code);
      addWarning(
        warnings,
        code,
        "An operating weekday is missing a schedule assignment.",
      );
    }

    return scheduleId;
  }

  if (config.pattern.scheduleIds.length === 0) {
    const code = "repeating_pattern_missing_schedules";
    warningCodes.push(code);
    addWarning(
      warnings,
      code,
      "The repeating schedule pattern needs at least one schedule.",
    );
    return null;
  }

  const startIndex = config.pattern.startIndex || 0;
  const safeStartIndex =
    ((startIndex % config.pattern.scheduleIds.length) + config.pattern.scheduleIds.length) %
    config.pattern.scheduleIds.length;
  const scheduleIndex = (safeStartIndex + repeatingIndex) % config.pattern.scheduleIds.length;

  return config.pattern.scheduleIds[scheduleIndex] || null;
}

function shouldAdvanceRepeatingPattern(config: CalendarWizardConfig) {
  return config.pattern.type === "repeating";
}

function buildRangeMap<T extends { id: string; label: string }>(
  ranges: Array<T & { startDate: DateString; endDate: DateString }>,
  schoolYearStart: DateString,
  schoolYearEnd: DateString
) {
  const map = new Map<DateString, T[]>();

  for (const range of ranges) {
    const clampedRange = clampRangeToBounds(
      range.startDate,
      range.endDate,
      schoolYearStart,
      schoolYearEnd
    );

    if (!clampedRange) continue;

    for (const date of eachDateInRange(clampedRange.startDate, clampedRange.endDate)) {
      map.set(date, [...(map.get(date) || []), range]);
    }
  }

  return map;
}

function buildInfoMap(informationalDates: InformationalDate[] = []) {
  const map = new Map<DateString, InformationalDate[]>();

  for (const [index, info] of informationalDates.entries()) {
    const normalizedInfo = {
      ...info,
      id: info.id || `info-${index + 1}`,
    };

    map.set(info.date, [...(map.get(info.date) || []), normalizedInfo]);
  }

  return map;
}

function addRangeValidationWarnings(
  warnings: CalendarGenerationWarning[],
  noSchoolRanges: Array<NormalizedRange<NoSchoolRange>>,
  specialDays: ExpandedSpecialDay[],
  schoolYearStart: DateString,
  schoolYearEnd: DateString
) {
  for (const range of noSchoolRanges) {
    if (isRangeOutsideYear(range, schoolYearStart, schoolYearEnd)) {
      addWarning(
        warnings,
        "no_school_range_outside_year",
        "A no-school range falls outside the selected school year.",
        { sourceIds: [range.id] }
      );
    }
  }

  for (const specialDay of specialDays) {
    if (isRangeOutsideYear(specialDay, schoolYearStart, schoolYearEnd)) {
      addWarning(
        warnings,
        "special_day_outside_year",
        "A special school day falls outside the selected school year.",
        { sourceIds: [specialDay.id] }
      );
    }
  }

  for (let i = 0; i < noSchoolRanges.length; i++) {
    for (let j = i + 1; j < noSchoolRanges.length; j++) {
      if (
        rangesOverlap(
          noSchoolRanges[i].startDate,
          noSchoolRanges[i].endDate,
          noSchoolRanges[j].startDate,
          noSchoolRanges[j].endDate
        )
      ) {
        addWarning(
          warnings,
          "overlapping_no_school_ranges",
          "Two no-school ranges overlap.",
          { sourceIds: [noSchoolRanges[i].id, noSchoolRanges[j].id] }
        );
      }
    }
  }

  for (let i = 0; i < specialDays.length; i++) {
    for (let j = i + 1; j < specialDays.length; j++) {
      if (
        rangesOverlap(
          specialDays[i].startDate,
          specialDays[i].endDate,
          specialDays[j].startDate,
          specialDays[j].endDate
        )
      ) {
        addWarning(
          warnings,
          "overlapping_special_days",
          "Two special school day ranges overlap.",
          { sourceIds: [specialDays[i].id, specialDays[j].id] }
        );
      }
    }
  }
}

function summarize(days: GeneratedCalendarDay[], warningCount: number) {
  const summary = createEmptySummary();
  summary.totalDatesInRange = days.length;
  summary.warningCount = warningCount;

  for (const day of days) {
    if (!day.isOperatingDay) {
      summary.weekendOrNonOperatingDayCount += 1;
    }

    if (day.isOperatingDay && !day.isSchoolDay) {
      summary.noSchoolWeekdayCount += 1;
    }

    if (day.isSchoolDay) {
      summary.instructionalDayCount += 1;
      incrementCount(summary.countByBaseSchedule, day.baseScheduleId);
      incrementCount(summary.countByActualSchedule, day.scheduleId);

      if (!day.scheduleId) {
        summary.unassignedInstructionalDayCount += 1;
      }
    }

    if (day.sources.specialDayIds.length > 0 && day.isSchoolDay) {
      summary.specialInstructionalDayCount += 1;
    }
  }

  return summary;
}

export function generateSchoolYearCalendar(
  config: CalendarWizardConfig
): CalendarGenerationResult {
  const warnings: CalendarGenerationWarning[] = [];
  const schoolYearStart = config.schoolYear.startDate;
  const schoolYearEnd = config.schoolYear.endDate;
  const operatingWeekdaySet = new Set(config.operatingWeekdays);

  if (compareDateStrings(schoolYearStart, schoolYearEnd) > 0) {
    addWarning(
      warnings,
      "start_date_after_end_date",
      "The first instructional day must be before the last instructional day."
    );

    return {
      days: [],
      warnings,
      summary: { ...createEmptySummary(), warningCount: warnings.length },
    };
  }

  if (operatingWeekdaySet.size === 0) {
    addWarning(
      warnings,
      "no_operating_weekdays",
      "Choose at least one weekday when school normally operates."
    );
  }

  const noSchoolRanges = (config.noSchoolRanges || []).map((range, index) =>
    normalizeRange(range, index, "no-school")
  );
  const specialDays = (config.specialDays || []).map((specialDay, index) => ({
    ...normalizeRange(specialDay, index, "special"),
    isInstructional: specialDay.isInstructional ?? true,
    rotationBehavior: specialDay.rotationBehavior || "advance",
  }));
  const noSchoolMap = buildRangeMap(noSchoolRanges, schoolYearStart, schoolYearEnd);
  const specialDayMap = buildRangeMap(specialDays, schoolYearStart, schoolYearEnd);
  const infoMap = buildInfoMap(config.informationalDates);
  const days: GeneratedCalendarDay[] = [];

  addRangeValidationWarnings(
    warnings,
    noSchoolRanges,
    specialDays,
    schoolYearStart,
    schoolYearEnd
  );

  let repeatingIndex = 0;

  for (const date of eachDateInRange(schoolYearStart, schoolYearEnd)) {
    const weekday = getWeekday(date);
    const isOperatingDay = operatingWeekdaySet.has(weekday);
    const noSchoolEntries = noSchoolMap.get(date) || [];
    const specialEntries = specialDayMap.get(date) || [];
    const informationalEntries = infoMap.get(date) || [];
    const labels: string[] = [];
    const warningCodes: CalendarGenerationWarningCode[] = [];
    const sources = {
      noSchoolRangeIds: noSchoolEntries.map((entry) => entry.id),
      specialDayIds: specialEntries.map((entry) => entry.id),
      informationalDateIds: informationalEntries.map((entry) => entry.id || ""),
    };

    addLabels(labels, informationalEntries.map((entry) => entry.label));

    if (!isOperatingDay) {
      addLabels(labels, noSchoolEntries.map((entry) => entry.label));
      addLabels(labels, specialEntries.map((entry) => entry.label));
      days.push({
        date,
        weekday,
        isOperatingDay,
        isSchoolDay: false,
        baseScheduleId: null,
        scheduleId: null,
        labels,
        sources,
        warningCodes,
      });
      continue;
    }

    if (noSchoolEntries.length > 0) {
      addLabels(labels, noSchoolEntries.map((entry) => entry.label));

      const conflictingSpecialEntries = specialEntries.filter(
        (entry) => entry.isInstructional || Boolean(entry.scheduleId)
      );

      if (conflictingSpecialEntries.length > 0) {
        const code = "special_day_overlaps_no_school";
        warningCodes.push(code);
        addWarning(
          warnings,
          code,
          "A special school day overlaps a no-school day. The date remains no school.",
          {
            dates: [date],
            sourceIds: [
              ...sources.noSchoolRangeIds,
              ...conflictingSpecialEntries.map((entry) => entry.id),
            ],
          }
        );
      }

      if (specialEntries.length > 0) {
        addLabels(labels, specialEntries.map((entry) => entry.label));
      }

      days.push({
        date,
        weekday,
        isOperatingDay,
        isSchoolDay: false,
        baseScheduleId: null,
        scheduleId: null,
        labels,
        sources,
        warningCodes,
      });
      continue;
    }

    const baseScheduleId = getNormalScheduleId(
      config,
      weekday,
      repeatingIndex,
      warnings,
      warningCodes
    );
    const specialDay = specialEntries[0] || null;

    if (specialEntries.length > 1) {
      const code = "duplicate_special_day";
      warningCodes.push(code);
      addWarning(
        warnings,
        code,
        "Multiple special school day rules apply to the same date. The first rule was used.",
        { dates: [date], sourceIds: sources.specialDayIds }
      );
    }

    if (specialDay) {
      addLabels(labels, [specialDay.label]);

      if (!specialDay.isInstructional) {
        if (specialDay.rotationBehavior === "restart" && shouldAdvanceRepeatingPattern(config)) {
          repeatingIndex = 0;
        }

        days.push({
          date,
          weekday,
          isOperatingDay,
          isSchoolDay: false,
          baseScheduleId: null,
          scheduleId: null,
          labels,
          sources,
          warningCodes,
        });
        continue;
      }
    }

    const scheduleId = specialDay?.scheduleId ?? baseScheduleId;

    if (!scheduleId) {
      const code = "instructional_day_missing_schedule";
      warningCodes.push(code);
      addWarning(
        warnings,
        code,
        "An instructional day does not have a schedule assigned.",
        { dates: [date] }
      );
    }

    days.push({
      date,
      weekday,
      isOperatingDay,
      isSchoolDay: true,
      baseScheduleId,
      scheduleId,
      labels,
      sources,
      warningCodes,
    });

    if (shouldAdvanceRepeatingPattern(config)) {
      const behavior = specialDay?.rotationBehavior || "advance";

      // Restart semantics: special instructional dates consume their current
      // normal pattern position, then the sequence resets after the last date
      // in that special-day range.
      if (behavior === "advance" || behavior === "restart") {
        repeatingIndex += 1;
      }

      if (behavior === "restart" && specialDay && date === specialDay.endDate) {
        repeatingIndex = 0;
      }
    }
  }

  return {
    days,
    warnings,
    summary: summarize(days, warnings.length),
  };
}
