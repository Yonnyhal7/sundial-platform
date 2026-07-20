import CalendarScheduleClient, {
  type CalendarScheduleDay,
  type CalendarScheduleMonth,
} from "@/components/mobile-app/CalendarScheduleClient";
import {
  getAssignedScheduleForCalendarDay,
  getCalendarDayScheduleIds,
  getScheduleByIdForSchool,
  type CalendarDayScheduleSummary,
} from "@/lib/calendarDaySchedule";
import { requireMobileAppSchool } from "@/lib/mobileAppData";
import { formatLocalDate, getMonthKey } from "@/lib/localDate";
import { createNavDiagnostics } from "@/lib/navDiagnostics";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  sortPeriodsByScheduleOrder,
  type SchedulePeriod,
} from "@/lib/scheduleTime";

type CalendarDay = {
  id: string;
  school_id: string;
  date: string;
  label: string | null;
  is_school_day: boolean;
  schedule_id: string | null;
};

type PeriodWithSchedule = SchedulePeriod & {
  schedule_id: string;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

function getMonthGridDates(baseDate: Date) {
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

function getMonthQuery(date: Date) {
  return getMonthKey(date);
}

function getBaseMonth(month?: string) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, monthNumber] = month.split("-").map(Number);

    return new Date(year, monthNumber - 1, 1);
  }

  const today = new Date();

  return new Date(today.getFullYear(), today.getMonth(), 1);
}

export default async function MobileSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { school } = await params;
  const { month } = await searchParams;
  const navTiming = createNavDiagnostics("schedule", school);
  const [supabase, schoolData] = await Promise.all([
    createSupabaseServerClient(),
    navTiming.query("school", () => requireMobileAppSchool(school)),
  ]);

  const todayDate = new Date();
  const baseMonth = getBaseMonth(month);
  const displayedMonths = [-1, 0, 1].map(
    (offset) =>
      new Date(baseMonth.getFullYear(), baseMonth.getMonth() + offset, 1)
  );
  const monthDatesByKey = new Map(
    displayedMonths.map((displayedMonth) => [
      getMonthQuery(displayedMonth),
      getMonthGridDates(displayedMonth),
    ])
  );
  const firstMonthDates = monthDatesByKey.get(
    getMonthQuery(displayedMonths[0])
  )!;
  const lastMonthDates = monthDatesByKey.get(
    getMonthQuery(displayedMonths[displayedMonths.length - 1])
  )!;
  const startDate = formatLocalDate(firstMonthDates[0]);
  const endDate = formatLocalDate(lastMonthDates[lastMonthDates.length - 1]);

  const { data: calendarDays } = await navTiming.query("calendar", () =>
    supabase
      .from("calendar_days")
      .select(
        `
      id,
      school_id,
      date,
      label,
      is_school_day,
      schedule_id
    `
      )
      .eq("school_id", schoolData.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })
      .returns<CalendarDay[]>()
  );

  const scheduleIds = getCalendarDayScheduleIds(calendarDays || []);
  let scheduleById = new Map<string, CalendarDayScheduleSummary>();
  let periodsByScheduleId: Record<string, SchedulePeriod[]> = {};

  if (scheduleIds.length > 0) {
    const [{ data: scheduleData }, { data: periodData }] = await Promise.all([
      navTiming.query("schedules", () =>
        supabase
          .from("schedules")
          .select("id, school_id, schedule_name, schedule_type, calendar_color, setup_status, active")
          .eq("school_id", schoolData.id)
          .eq("active", true)
          .in("id", scheduleIds)
          .returns<CalendarDayScheduleSummary[]>()
      ),
      navTiming.query("periods", () =>
        supabase
          .from("periods")
          .select("id, schedule_id, name, start_time, end_time, sort_order")
          .eq("school_id", schoolData.id)
          .in("schedule_id", scheduleIds)
          .returns<PeriodWithSchedule[]>()
      ),
    ]);

    scheduleById = getScheduleByIdForSchool(scheduleData || [], schoolData.id);

    periodsByScheduleId = (periodData || []).reduce<Record<string, SchedulePeriod[]>>(
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

  const calendarDayByDate = new Map(
    (calendarDays || []).map((calendarDay) => [calendarDay.date, calendarDay])
  );
  const today = formatLocalDate(todayDate);
  const months: CalendarScheduleMonth[] = displayedMonths.map(
    (displayedMonth) => {
      const monthKey = getMonthQuery(displayedMonth);
      const currentMonth = displayedMonth.getMonth();
      const monthDates = monthDatesByKey.get(monthKey) || [];
      const days: CalendarScheduleDay[] = monthDates.map((date) => {
        const dateKey = formatLocalDate(date);
        const calendarDay = calendarDayByDate.get(dateKey);
        const assignedSchedule = getAssignedScheduleForCalendarDay(
          calendarDay,
          scheduleById
        );
        const periods = calendarDay?.schedule_id
          ? periodsByScheduleId[calendarDay.schedule_id] || []
          : [];

        return {
          date: dateKey,
          dayNumber: date.toLocaleDateString("en-US", { day: "numeric" }),
          inCurrentMonth: date.getMonth() === currentMonth,
          isToday: dateKey === today,
          weekdayLabel: date.toLocaleDateString("en-US", {
            weekday: "long",
          }),
          longDateLabel: date.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
          isSchoolDay: calendarDay?.is_school_day ?? null,
          scheduleName: assignedSchedule?.schedule_name || null,
          scheduleType: assignedSchedule?.schedule_type || null,
          scheduleColor: assignedSchedule?.calendar_color || null,
          scheduleSetupStatus: assignedSchedule?.setup_status || null,
          label: calendarDay?.label || null,
          periods: sortPeriodsByScheduleOrder(periods),
        };
      });

      return {
        monthKey,
        monthLabel: displayedMonth.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
        days,
      };
    }
  );
  navTiming.log();

  return (
    <main className="space-y-5">
      <header>
        <p className="text-sm font-bold text-[var(--school-primary)]">
          Calendar
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          Calendar
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
          Tap a date to view that day&apos;s schedule
        </p>
      </header>

      <CalendarScheduleClient
        key={getMonthQuery(baseMonth)}
        currentMonthKey={getMonthQuery(baseMonth)}
        today={today}
        months={months}
      />
    </main>
  );
}
