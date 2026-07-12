import type { CalendarScheduleDay } from "@/components/mobile-app/CalendarScheduleClient";
import {
  sortPeriodsByScheduleOrder,
  type SchedulePeriod,
} from "@/lib/scheduleTime";
import type {
  OfflineCalendarDay,
  OfflineSchedule,
  SchoolOfflineSnapshot,
} from "@/lib/offline/types";

export function formatDateKey(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

export function getTodayDateKey() {
  return formatDateKey(new Date());
}

export function getScheduleById(snapshot: SchoolOfflineSnapshot) {
  return new Map(snapshot.data.schedules.map((schedule) => [schedule.id, schedule]));
}

export function getPeriodsByScheduleId(snapshot: SchoolOfflineSnapshot) {
  return snapshot.data.periods.reduce<Record<string, SchedulePeriod[]>>(
    (acc, period) => {
      const periods = acc[period.schedule_id] || [];
      periods.push({
        id: period.id,
        name: period.name,
        start_time: period.start_time,
        end_time: period.end_time,
        sort_order: period.sort_order,
      });
      acc[period.schedule_id] = periods;
      return acc;
    },
    {}
  );
}

export function getTodaySchedule(snapshot: SchoolOfflineSnapshot) {
  const today = getTodayDateKey();
  const day = snapshot.data.calendarDays.find((calendarDay) => calendarDay.date === today);
  const scheduleById = getScheduleById(snapshot);
  const schedule = day?.schedule_id ? scheduleById.get(day.schedule_id) || null : null;
  const periodsByScheduleId = getPeriodsByScheduleId(snapshot);
  const periods = day?.schedule_id ? periodsByScheduleId[day.schedule_id] || [] : [];
  const scheduleName =
    day?.is_school_day === false
      ? day.label || "No School"
      : schedule?.schedule_name || "No Schedule Assigned";
  const todayScheduleLabel = schedule?.schedule_type
    ? `${scheduleName} (${schedule.schedule_type})`
    : scheduleName;

  return {
    date: today,
    day,
    schedule,
    periods: sortPeriodsByScheduleOrder(periods),
    todayScheduleLabel,
    noSchool: day?.is_school_day === false,
    scheduleNeedsTimes: schedule?.setup_status === "needs_times",
  };
}

export function getMonthGridDates(baseDate: Date) {
  const firstOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const lastOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
  const gridEnd = addDays(lastOfMonth, 6 - lastOfMonth.getDay());
  const dates: Date[] = [];

  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    dates.push(new Date(cursor));
  }

  return dates;
}

export function getMonthQuery(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");

  return `${yyyy}-${mm}`;
}

export function getBaseMonth(month?: string | null) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, monthNumber] = month.split("-").map(Number);

    return new Date(year, monthNumber - 1, 1);
  }

  const today = new Date();

  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function mapCalendarScheduleDay({
  date,
  currentMonth,
  today,
  day,
  schedule,
  periods,
}: {
  date: Date;
  currentMonth: number;
  today: string;
  day: OfflineCalendarDay | undefined;
  schedule: OfflineSchedule | null;
  periods: SchedulePeriod[];
}): CalendarScheduleDay {
  const dateKey = formatDateKey(date);

  return {
    date: dateKey,
    dayNumber: date.toLocaleDateString("en-US", { day: "numeric" }),
    inCurrentMonth: date.getMonth() === currentMonth,
    isToday: dateKey === today,
    weekdayLabel: date.toLocaleDateString("en-US", { weekday: "long" }),
    longDateLabel: date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    isSchoolDay: day?.is_school_day ?? null,
    scheduleName: schedule?.schedule_name || null,
    scheduleType: schedule?.schedule_type || null,
    scheduleColor: schedule?.calendar_color || null,
    scheduleSetupStatus: schedule?.setup_status || null,
    label: day?.label || null,
    periods: sortPeriodsByScheduleOrder(periods),
  };
}

export function getCalendarScheduleDays(
  snapshot: SchoolOfflineSnapshot,
  month?: string | null
) {
  const baseMonth = getBaseMonth(month);
  const monthDates = getMonthGridDates(baseMonth);
  const calendarDayByDate = new Map(
    snapshot.data.calendarDays.map((calendarDay) => [calendarDay.date, calendarDay])
  );
  const scheduleById = getScheduleById(snapshot);
  const periodsByScheduleId = getPeriodsByScheduleId(snapshot);
  const today = getTodayDateKey();

  return {
    baseMonth,
    today,
    days: monthDates.map((date) => {
      const dateKey = formatDateKey(date);
      const day = calendarDayByDate.get(dateKey);
      const schedule = day?.schedule_id ? scheduleById.get(day.schedule_id) || null : null;
      const periods = day?.schedule_id ? periodsByScheduleId[day.schedule_id] || [] : [];

      return mapCalendarScheduleDay({
        date,
        currentMonth: baseMonth.getMonth(),
        today,
        day,
        schedule,
        periods,
      });
    }),
  };
}
