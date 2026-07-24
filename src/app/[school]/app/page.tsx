import AppScheduleDashboard from "@/components/mobile-app/AppScheduleDashboard";
import {
  getAssignedScheduleForCalendarDay,
  getScheduleByIdForSchool,
  getScheduleDisplayName,
  type CalendarDayScheduleSummary,
} from "@/lib/calendarDaySchedule";
import { requireMobileAppSchool } from "@/lib/mobileAppData";
import { createNavDiagnostics } from "@/lib/navDiagnostics";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateInTimeZone } from "@/lib/localDate";
import type { SchedulePeriod } from "@/lib/scheduleTime";
import { getTimeZoneClockParts } from "@/lib/timezones";

type CalendarDay = {
  id: string;
  school_id: string;
  date: string;
  label: string | null;
  is_school_day: boolean;
  schedule_id: string | null;
};

function getGreeting(timeZone: string) {
  const hour = getTimeZoneClockParts(new Date(), timeZone).hour;

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function MobileAppHome({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const navTiming = createNavDiagnostics("home", school);
  const [supabase, schoolData] = await Promise.all([
    createSupabaseServerClient(),
    navTiming.query("school", () => requireMobileAppSchool(school)),
  ]);
  const today = formatDateInTimeZone(new Date(), schoolData.timezone);

  const { data: calendarDay } = await navTiming.query("calendar", () =>
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
      .eq("date", today)
      .maybeSingle<CalendarDay>()
  );

  let assignedSchedule: CalendarDayScheduleSummary | null = null;

  if (calendarDay?.schedule_id && calendarDay.is_school_day !== false) {
    const { data: schedules } = await navTiming.query("schedules", () =>
      supabase
        .from("schedules")
        .select("id, school_id, schedule_name, schedule_type, setup_status, active")
        .eq("school_id", schoolData.id)
        .eq("active", true)
        .eq("id", calendarDay.schedule_id)
        .returns<CalendarDayScheduleSummary[]>()
    );

    assignedSchedule = getAssignedScheduleForCalendarDay(
      calendarDay,
      getScheduleByIdForSchool(schedules || [], schoolData.id)
    );
  }

  let periods: SchedulePeriod[] = [];

  if (assignedSchedule) {
    const { data: periodData } = await navTiming.query("periods", () =>
      supabase
        .from("periods")
        .select("id, name, start_time, end_time, sort_order")
        .eq("school_id", schoolData.id)
        .eq("schedule_id", assignedSchedule.id)
        .order("sort_order", { ascending: true })
        .order("start_time", { ascending: true })
    );

    periods = periodData || [];
  }

  const scheduleName = calendarDay?.is_school_day === false
    ? calendarDay.label || "No School"
    : assignedSchedule?.schedule_name || "No Schedule Assigned";
  const scheduleNeedsTimes = assignedSchedule?.setup_status === "needs_times";
  const todayScheduleLabel =
    calendarDay?.is_school_day === false || !assignedSchedule
      ? scheduleName
      : getScheduleDisplayName(assignedSchedule);
  const todayLabel = new Date(`${today}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const greeting = getGreeting(schoolData.timezone || "America/Los_Angeles");
  navTiming.log();

  return (
    <main className="space-y-[clamp(1.25rem,3.2vw,1.75rem)]">
      <section className="pt-[clamp(0.75rem,2vw,1rem)] text-center">
        <p className="text-[clamp(1.25rem,3.5vw,1.7rem)] font-medium leading-tight text-[var(--school-primary)]">
          {greeting},
        </p>
        <h1 className="mt-[clamp(0.5rem,1.5vw,0.75rem)] text-[clamp(1.75rem,5.4vw,2.65rem)] font-black leading-none tracking-tight text-slate-950 dark:text-white">
          {schoolData.name}
        </h1>
        <p className="mt-[clamp(1.25rem,3vw,1.5rem)] text-[clamp(0.95rem,2.2vw,1.1rem)] font-black text-slate-500 dark:text-[#a3a3a3]">
          {todayLabel}
        </p>
        <div className="mx-auto mt-[clamp(1.25rem,3vw,1.5rem)] h-0.5 w-[clamp(3.5rem,10vw,3.75rem)] rounded-full bg-[var(--school-accent-visible)]" />
      </section>

      <AppScheduleDashboard
        school={school}
        periods={periods}
        todayScheduleLabel={todayScheduleLabel}
        noSchool={calendarDay?.is_school_day === false}
        scheduleNeedsTimes={scheduleNeedsTimes}
        timeZone={schoolData.timezone || "America/Los_Angeles"}
      />
    </main>
  );
}
