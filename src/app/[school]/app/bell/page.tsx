import BellScheduleClient from "@/components/mobile-app/BellScheduleClient";
import { requireMobileAppSchool } from "@/lib/mobileAppData";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  sortPeriodsByScheduleOrder,
  type SchedulePeriod,
} from "@/lib/scheduleTime";

type Schedule = {
  id: string;
  schedule_name: string;
  schedule_type: string | null;
  calendar_color: string | null;
  setup_status: string | null;
};

type PeriodWithSchedule = SchedulePeriod & {
  schedule_id: string;
};

function isModifiedSchedule(
  schedule: Pick<Schedule, "schedule_name" | "schedule_type">
) {
  const value = `${schedule.schedule_name} ${schedule.schedule_type || ""}`.toLowerCase();

  return ["rally", "assembly", "special", "early", "modified"].some((word) =>
    value.includes(word)
  );
}

export default async function BellSchedulePage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const [supabase, schoolData] = await Promise.all([
    createSupabaseServerClient(),
    requireMobileAppSchool(school),
  ]);

  const { data: schedules } = await supabase
    .from("schedules")
    .select("id, schedule_name, schedule_type, calendar_color, setup_status")
    .eq("school_id", schoolData.id)
    .eq("active", true)
    .order("schedule_name", { ascending: true })
    .returns<Schedule[]>();

  const scheduleIds = (schedules || []).map((schedule) => schedule.id);
  let periodsByScheduleId: Record<string, SchedulePeriod[]> = {};

  if (scheduleIds.length > 0) {
    const { data: periodData } = await supabase
      .from("periods")
      .select("id, schedule_id, name, start_time, end_time, sort_order")
      .eq("school_id", schoolData.id)
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

  const mappedSchedules = (schedules || []).map((schedule) => ({
    id: schedule.id,
    name: schedule.schedule_name,
    type: schedule.schedule_type,
    calendarColor: schedule.calendar_color,
    setupStatus: schedule.setup_status,
    periods: sortPeriodsByScheduleOrder(periodsByScheduleId[schedule.id] || []),
  }));

  return (
    <main className="space-y-5">
      <header>
        <p className="text-sm font-bold text-[var(--school-primary)]">
          Bell Schedule
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          Period Times
        </h1>
      </header>

      <BellScheduleClient
        school={school}
        standardSchedules={mappedSchedules.filter((schedule) => !isModifiedSchedule({
          schedule_name: schedule.name,
          schedule_type: schedule.type,
        }))}
        modifiedSchedules={mappedSchedules.filter((schedule) => isModifiedSchedule({
          schedule_name: schedule.name,
          schedule_type: schedule.type,
        }))}
      />
    </main>
  );
}
