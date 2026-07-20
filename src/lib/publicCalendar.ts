import { getAssignedScheduleForCalendarDay, getScheduleByIdForSchool, hasMeaningfulCalendarDayStatus, type CalendarDayScheduleSummary } from "@/lib/calendarDaySchedule";
import { sortPeriodsByScheduleOrder, type SchedulePeriod } from "@/lib/scheduleTime";

export type PublicCalendarEvent = {
  id: string;
  title: string;
  location: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
};

export type PublicCalendarDay = {
  date: string;
  isSchoolDay: boolean;
  hasMeaningfulStatus: boolean;
  label: string | null;
  scheduleName: string | null;
  scheduleType: string | null;
  scheduleColor: string | null;
  scheduleSetupStatus: string | null;
  periods: SchedulePeriod[];
  events: PublicCalendarEvent[];
};

export type PublicCalendarViewModel = {
  school: { id: string; slug: string; name: string; timezone: string | null };
  today: string;
  academicYear: { startDate: string; endDate: string; label: string } | null;
  days: PublicCalendarDay[];
};

export type PublicCalendarDayRow = {
  id: string;
  school_id: string;
  date: string;
  label: string | null;
  is_school_day: boolean | null;
  schedule_id: string | null;
};

export type PublicCalendarPeriodRow = SchedulePeriod & { school_id: string; schedule_id: string };
export type PublicCalendarEventRow = {
  id: string;
  school_id: string;
  title: string;
  location: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
};

export function getAcademicYearLabel(startDate: string, endDate: string) {
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  return startYear === endYear ? startYear : `${startYear}–${endYear}`;
}

export function getMonthGridDateStrings(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstDay = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index - firstDay + 1));
    return date.toISOString().slice(0, 10);
  });
}

export function shiftMonthKey(monthKey: string, offset: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildPublicCalendarViewModel(input: {
  school: { id: string; slug: string; name: string; timezone: string | null };
  today: string;
  calendarDays: PublicCalendarDayRow[];
  schedules: CalendarDayScheduleSummary[];
  periods: PublicCalendarPeriodRow[];
  events: PublicCalendarEventRow[];
}): PublicCalendarViewModel {
  const calendarDays = input.calendarDays
    .filter((day) => day.school_id === input.school.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const scheduleById = getScheduleByIdForSchool(input.schedules, input.school.id);
  const ownedScheduleIds = new Set(scheduleById.keys());
  const periodsByScheduleId = input.periods
    .filter((period) => period.school_id === input.school.id && ownedScheduleIds.has(period.schedule_id))
    .reduce<Record<string, SchedulePeriod[]>>((result, period) => {
      (result[period.schedule_id] ||= []).push({
        id: period.id,
        name: period.name,
        start_time: period.start_time,
        end_time: period.end_time,
        sort_order: period.sort_order,
      });
      return result;
    }, {});
  const eventsByDate = input.events
    .filter((event) => event.school_id === input.school.id)
    .reduce<Record<string, PublicCalendarEvent[]>>((result, event) => {
      (result[event.event_date] ||= []).push({
        id: event.id,
        title: event.title,
        location: event.location,
        eventDate: event.event_date,
        startTime: event.start_time,
        endTime: event.end_time,
      });
      return result;
    }, {});

  const days = calendarDays.map<PublicCalendarDay>((day) => {
    const schedule = getAssignedScheduleForCalendarDay(day, scheduleById);
    return {
      date: day.date,
      isSchoolDay: day.is_school_day !== false,
      hasMeaningfulStatus: hasMeaningfulCalendarDayStatus({ scheduleId: day.schedule_id, label: day.label, isSchoolDay: day.is_school_day }),
      label: day.label,
      scheduleName: schedule?.schedule_name || null,
      scheduleType: schedule?.schedule_type || null,
      scheduleColor: schedule?.calendar_color || null,
      scheduleSetupStatus: schedule?.setup_status || null,
      periods: schedule ? sortPeriodsByScheduleOrder(periodsByScheduleId[schedule.id] || []) : [],
      events: eventsByDate[day.date] || [],
    };
  });
  const firstDate = days[0]?.date;
  const lastDate = days[days.length - 1]?.date;

  return {
    school: input.school,
    today: input.today,
    academicYear: firstDate && lastDate ? {
      startDate: firstDate,
      endDate: lastDate,
      label: getAcademicYearLabel(firstDate, lastDate),
    } : null,
    days,
  };
}
