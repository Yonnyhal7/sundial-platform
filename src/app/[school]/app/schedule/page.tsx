import { notFound } from "next/navigation";
import WeeklyScheduleClient from "@/components/mobile-app/WeeklyScheduleClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  sortPeriodsByScheduleOrder,
  type SchedulePeriod,
} from "@/lib/scheduleTime";

type School = {
  id: string;
};

type CalendarDay = {
  id: string;
  date: string;
  label: string | null;
  is_school_day: boolean;
  schedule_id: string | null;
  schedule:
    | {
        id: string;
        schedule_name: string;
        schedule_type: string | null;
      }
    | {
        id: string;
        schedule_name: string;
        schedule_type: string | null;
      }[]
    | null;
};

type PeriodWithSchedule = SchedulePeriod & {
  schedule_id: string;
};

function formatDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function getWeekDates() {
  const today = new Date();
  const start = new Date(today);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default async function MobileSchedulePage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<School>();

  if (!schoolData) {
    notFound();
  }

  const weekDates = getWeekDates();
  const startDate = formatDate(weekDates[0]);
  const endDate = formatDate(weekDates[6]);

  const { data: calendarDays } = await supabase
    .from("calendar_days")
    .select(
      `
      id,
      date,
      label,
      is_school_day,
      schedule_id,
      schedule:schedules (
        id,
        schedule_name,
        schedule_type
      )
    `
    )
    .eq("school_id", schoolData.id)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true })
    .returns<CalendarDay[]>();

  const scheduleIds = Array.from(
    new Set((calendarDays || []).map((day) => day.schedule_id).filter(Boolean))
  ) as string[];
  let periodsByScheduleId: Record<string, SchedulePeriod[]> = {};

  if (scheduleIds.length > 0) {
    const { data: periodData } = await supabase
      .from("periods")
      .select("id, schedule_id, name, start_time, end_time, sort_order")
      .in("schedule_id", scheduleIds)
      .returns<PeriodWithSchedule[]>();

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

  const days = weekDates.map((date) => {
    const dateKey = formatDate(date);
    const calendarDay = calendarDays?.find((dayItem) => dayItem.date === dateKey);
    const assignedSchedule = Array.isArray(calendarDay?.schedule)
      ? calendarDay?.schedule[0]
      : calendarDay?.schedule;
    const periods = calendarDay?.schedule_id
      ? periodsByScheduleId[calendarDay.schedule_id] || []
      : [];

    return {
      date: dateKey,
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      label: date.toLocaleDateString("en-US", { day: "numeric" }),
      scheduleName: calendarDay?.is_school_day === false
        ? calendarDay.label || "No School"
        : assignedSchedule?.schedule_name || calendarDay?.label || "No Schedule",
      scheduleType: assignedSchedule?.schedule_type || null,
      isSchoolDay: calendarDay?.is_school_day !== false,
      periods: sortPeriodsByScheduleOrder(periods),
    };
  });

  return (
    <main className="space-y-5">
      <header>
        <p className="text-sm font-bold text-[var(--school-primary)]">
          Weekly Schedule
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          This Week
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
          {weekDates[0].toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}{" "}
          -{" "}
          {weekDates[6].toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </p>
      </header>

      <WeeklyScheduleClient days={days} />
    </main>
  );
}
