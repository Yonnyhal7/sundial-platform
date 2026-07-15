export type CalendarDayScheduleSummary = {
  id: string;
  school_id: string;
  schedule_name: string;
  schedule_type: string | null;
  calendar_color?: string | null;
  setup_status: string | null;
  active?: boolean | null;
};

export type CalendarDayScheduleAssignment = {
  school_id?: string | null;
  schedule_id: string | null;
  is_school_day?: boolean | null;
};

export function getCalendarDayScheduleIds(
  calendarDays: CalendarDayScheduleAssignment[]
) {
  return Array.from(
    new Set(
      calendarDays
        .filter((day) => day.is_school_day !== false)
        .map((day) => day.schedule_id)
        .filter((scheduleId): scheduleId is string => Boolean(scheduleId))
    )
  );
}

export function getScheduleByIdForSchool(
  schedules: CalendarDayScheduleSummary[],
  schoolId: string
) {
  return new Map(
    schedules
      .filter((schedule) => schedule.school_id === schoolId)
      .map((schedule) => [schedule.id, schedule])
  );
}

export function getAssignedScheduleForCalendarDay(
  calendarDay: CalendarDayScheduleAssignment | null | undefined,
  scheduleById: Map<string, CalendarDayScheduleSummary>
) {
  if (
    !calendarDay ||
    calendarDay.is_school_day === false ||
    !calendarDay.schedule_id
  ) {
    return null;
  }

  const schedule = scheduleById.get(calendarDay.schedule_id) || null;

  if (
    schedule &&
    calendarDay.school_id &&
    schedule.school_id !== calendarDay.school_id
  ) {
    return null;
  }

  return schedule;
}

export function getScheduleDisplayName(
  schedule: Pick<CalendarDayScheduleSummary, "schedule_name" | "schedule_type">
) {
  return schedule.schedule_type
    ? `${schedule.schedule_name} (${schedule.schedule_type})`
    : schedule.schedule_name;
}
