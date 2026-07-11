import type { GeneratedCalendarDay } from "./types";

export type CalendarDayInsertRow = {
  school_id: string;
  date: string;
  schedule_id: string | null;
  base_schedule_id: string | null;
  label: string | null;
  is_school_day: boolean;
};

export function combineCalendarDayLabels(labels: string[]) {
  const cleanLabels = labels
    .map((label) => label.trim())
    .filter(Boolean)
    .filter((label, index, allLabels) => allLabels.indexOf(label) === index);

  return cleanLabels.length > 0 ? cleanLabels.join(" • ") : null;
}

export function shouldPersistGeneratedCalendarDay(day: GeneratedCalendarDay) {
  return (
    day.isSchoolDay ||
    (day.isOperatingDay && !day.isSchoolDay) ||
    day.labels.length > 0
  );
}

export function mapGeneratedDayToCalendarDayRow(
  day: GeneratedCalendarDay,
  schoolId: string
): CalendarDayInsertRow | null {
  if (!shouldPersistGeneratedCalendarDay(day)) {
    return null;
  }

  return {
    school_id: schoolId,
    date: day.date,
    schedule_id: day.isSchoolDay ? day.scheduleId : null,
    base_schedule_id: day.isSchoolDay ? day.baseScheduleId : null,
    label: combineCalendarDayLabels(day.labels),
    is_school_day: day.isSchoolDay,
  };
}

export function mapGeneratedCalendarDaysToRows(
  days: GeneratedCalendarDay[],
  schoolId: string
) {
  return days
    .map((day) => mapGeneratedDayToCalendarDayRow(day, schoolId))
    .filter((row): row is CalendarDayInsertRow => row !== null);
}
