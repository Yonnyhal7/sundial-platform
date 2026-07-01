import { notFound } from "next/navigation";
import {
  BellIcon,
  MenuIcon,
} from "@/components/mobile-app/AppIcons";
import AppScheduleDashboard from "@/components/mobile-app/AppScheduleDashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SchedulePeriod } from "@/lib/scheduleTime";

type School = {
  id: string;
  name: string;
  primary_color: string | null;
  logo_url?: string | null;
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

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default async function MobileAppHome({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();
  const today = getTodayDateString();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<School>();

  if (!schoolData) {
    notFound();
  }

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
      <header className="relative flex items-center justify-between gap-[clamp(0.75rem,2.2vw,1rem)]">
        <button
          type="button"
          aria-label="Open menu"
          className="grid h-[clamp(3rem,8vw,4rem)] w-[clamp(3rem,8vw,4rem)] place-items-center rounded-[clamp(0.9rem,2.4vw,1.35rem)] border border-slate-200 bg-white text-slate-950 shadow-[0_10px_24px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
        >
          <MenuIcon className="h-[clamp(1.25rem,3vw,1.75rem)] w-[clamp(1.25rem,3vw,1.75rem)]" />
        </button>

        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {schoolData?.logo_url ? (
            // Prefer explicit logo URL when available
            <img
              src={schoolData.logo_url}
              alt={`${schoolData.name} logo`}
              className="h-[clamp(2rem,6vw,2.5rem)] w-[clamp(2rem,6vw,2.5rem)] object-contain"
            />
          ) : (
            // Fallback to initials avatar
            <div className="grid h-[clamp(2rem,6vw,2.5rem)] w-[clamp(2rem,6vw,2.5rem)] place-items-center rounded-[0.5rem] bg-[var(--school-primary)] text-white font-black">
              {getInitials(schoolData.name)}
            </div>
          )}
        </div>

        {/* <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[1.35rem] bg-[var(--school-primary)] text-base font-black text-white shadow-lg shadow-slate-900/10">
            {getInitials(schoolData.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-black leading-tight text-slate-950 dark:text-white">
              {schoolData.name}
            </p>
            <p className="mt-1 text-base font-black text-slate-500 dark:text-[#a3a3a3]">
              Sundial App
            </p>
          </div>
        </div> */}

        <button
          type="button"
          aria-label="Notifications"
          className="grid h-[clamp(3rem,8vw,4rem)] w-[clamp(3rem,8vw,4rem)] place-items-center rounded-[clamp(0.9rem,2.4vw,1.35rem)] border border-slate-200 bg-white text-slate-950 shadow-[0_10px_24px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
        >
          <BellIcon className="h-[clamp(1.25rem,3vw,1.75rem)] w-[clamp(1.25rem,3vw,1.75rem)]" />
        </button>
      </header>

      <section className="pt-[clamp(2rem,5vw,2.75rem)] text-center">
        <p className="text-[clamp(1.25rem,3.5vw,1.7rem)] font-medium leading-tight text-[var(--school-primary)]">
          {greeting},
        </p>
        <h1 className="mt-[clamp(0.5rem,1.5vw,0.75rem)] text-[clamp(1.75rem,5.4vw,2.65rem)] font-black leading-none tracking-tight text-slate-950 dark:text-white">
          {schoolData.name}
        </h1>
        <p className="mt-[clamp(1.25rem,3vw,1.5rem)] text-[clamp(0.95rem,2.2vw,1.1rem)] font-black text-slate-500 dark:text-[#a3a3a3]">
          {todayLabel}
        </p>
        <div className="mx-auto mt-[clamp(1.25rem,3vw,1.5rem)] h-0.5 w-[clamp(3.5rem,10vw,3.75rem)] rounded-full bg-[var(--school-primary)]" />
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
