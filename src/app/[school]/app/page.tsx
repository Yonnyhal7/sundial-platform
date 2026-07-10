import AppScheduleDashboard from "@/components/mobile-app/AppScheduleDashboard";
import { requireMobileAppSchool } from "@/lib/mobileAppData";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SchedulePeriod } from "@/lib/scheduleTime";

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

function getTodayDateString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function getGreeting() {
  const hour = new Date().getHours();

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
  const [supabase, schoolData] = await Promise.all([
    createSupabaseServerClient(),
    requireMobileAppSchool(school),
  ]);
  const today = getTodayDateString();

  const { data: calendarDay } = await supabase
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
    .eq("date", today)
    .maybeSingle<CalendarDay>();

  let periods: SchedulePeriod[] = [];

  if (calendarDay?.schedule_id && calendarDay.is_school_day !== false) {
    const { data: periodData } = await supabase
      .from("periods")
      .select("id, name, start_time, end_time, sort_order")
      .eq("schedule_id", calendarDay.schedule_id)
      .order("sort_order", { ascending: true })
      .order("start_time", { ascending: true });

    periods = periodData || [];
  }

  const assignedSchedule = Array.isArray(calendarDay?.schedule)
    ? calendarDay?.schedule[0]
    : calendarDay?.schedule;
  const scheduleName = calendarDay?.is_school_day === false
    ? calendarDay.label || "No School"
    : assignedSchedule?.schedule_name || "No Schedule Assigned";
  const scheduleType = assignedSchedule?.schedule_type || "";
  const todayScheduleLabel = scheduleType
    ? `${scheduleName} (${scheduleType})`
    : scheduleName;
  const todayLabel = new Date(`${today}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const greeting = getGreeting();

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
      />
    </main>
  );
}
