import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeScheduleSetupStatus } from "@/lib/scheduleStatus";
import { updateSchoolSetupStep } from "@/lib/schools";

export type CompleteSetupCalendarStepResult =
  | { status: "success"; schedulesNeedingTimes: ScheduleNeedingTimes[] }
  | {
      status: "validation_error";
      reason: "missing_calendar";
      message: string;
      schedulesNeedingTimes?: ScheduleNeedingTimes[];
    };

export type ScheduleNeedingTimes = {
  id: string;
  name: string;
};

export type ScheduleSetupReadiness = {
  complete: boolean;
  hasInstructionalCalendarDays: boolean;
  schedulesNeedingTimes: ScheduleNeedingTimes[];
};

type CalendarDayScheduleReference = {
  schedule_id: string | null;
  base_schedule_id: string | null;
};

type ScheduleReadinessRow = {
  id: string;
  schedule_name: string;
  setup_status: string | null;
  active: boolean | null;
};

type PeriodReadinessRow = {
  schedule_id: string;
  name: string;
  start_time: string;
  end_time: string;
};

export async function hasPersistedInstructionalCalendarDays(
  supabase: SupabaseClient,
  schoolId: string
) {
  const { data, error } = await supabase
    .from("calendar_days")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_school_day", true)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("Setup calendar verification error:", JSON.stringify(error, null, 2));
    return false;
  }

  return Boolean(data?.id);
}

export function revalidateSetupCalendarRoutes(school: string) {
  const paths = [
    `/${school}/admin`,
    `/${school}/admin/setup`,
    `/${school}/admin/setup/schedule`,
    `/${school}/admin/setup/complete`,
    `/${school}/admin/setup/launch`,
    `/${school}/admin/schedules`,
  ];

  for (const path of paths) {
    revalidatePath(path);
  }

  revalidatePath("/[school]/admin", "layout");
  revalidatePath("/[school]/admin/setup", "layout");
  revalidatePath("/[school]/admin/schedules", "page");
}

export async function getScheduleSetupReadiness(
  supabase: SupabaseClient,
  schoolId: string
): Promise<ScheduleSetupReadiness> {
  const { data: dayRefs, error: dayError } = await supabase
    .from("calendar_days")
    .select("schedule_id, base_schedule_id")
    .eq("school_id", schoolId)
    .eq("is_school_day", true)
    .returns<CalendarDayScheduleReference[]>();

  if (dayError) {
    console.error("Setup calendar readiness error:", JSON.stringify(dayError, null, 2));
    return {
      complete: false,
      hasInstructionalCalendarDays: false,
      schedulesNeedingTimes: [],
    };
  }

  const referencedScheduleIds = [
    ...new Set(
      (dayRefs || [])
        .flatMap((day) => [day.schedule_id, day.base_schedule_id])
        .filter((id): id is string => Boolean(id))
    ),
  ];

  if ((dayRefs || []).length === 0) {
    return {
      complete: false,
      hasInstructionalCalendarDays: false,
      schedulesNeedingTimes: [],
    };
  }

  if (referencedScheduleIds.length === 0) {
    return {
      complete: true,
      hasInstructionalCalendarDays: true,
      schedulesNeedingTimes: [],
    };
  }

  const { data: schedules, error: schedulesError } = await supabase
    .from("schedules")
    .select("id, schedule_name, setup_status, active")
    .eq("school_id", schoolId)
    .in("id", referencedScheduleIds)
    .returns<ScheduleReadinessRow[]>();

  if (schedulesError) {
    console.error("Setup schedule readiness lookup error:", JSON.stringify(schedulesError, null, 2));
    return {
      complete: false,
      hasInstructionalCalendarDays: true,
      schedulesNeedingTimes: [],
    };
  }

  const { data: periods, error: periodsError } = await supabase
    .from("periods")
    .select("schedule_id, name, start_time, end_time")
    .eq("school_id", schoolId)
    .in("schedule_id", referencedScheduleIds)
    .returns<PeriodReadinessRow[]>();

  if (periodsError) {
    console.error("Setup schedule period readiness lookup error:", JSON.stringify(periodsError, null, 2));
  }

  const periodsByScheduleId = new Map<string, PeriodReadinessRow[]>();
  for (const period of periods || []) {
    periodsByScheduleId.set(period.schedule_id, [
      ...(periodsByScheduleId.get(period.schedule_id) || []),
      period,
    ]);
  }

  const schedulesNeedingTimes = (schedules || [])
    .filter((schedule) => schedule.active !== false)
    .filter(
      (schedule) =>
        normalizeScheduleSetupStatus(
          schedule.setup_status,
          periodsByScheduleId.get(schedule.id) || []
        ) === "needs_times"
    )
    .map((schedule) => ({
      id: schedule.id,
      name: schedule.schedule_name,
    }));

  return {
    complete: true,
    hasInstructionalCalendarDays: true,
    schedulesNeedingTimes,
  };
}

export async function completeSetupCalendarStep({
  supabase,
  schoolId,
  school,
}: {
  supabase: SupabaseClient;
  schoolId: string;
  school: string;
}): Promise<CompleteSetupCalendarStepResult> {
  const readiness = await getScheduleSetupReadiness(supabase, schoolId);

  if (!readiness.hasInstructionalCalendarDays) {
    return {
      status: "validation_error",
      reason: "missing_calendar",
      message:
        "Create your school-year calendar before continuing to Launch School.",
    };
  }

  await updateSchoolSetupStep(supabase, schoolId, "complete");
  revalidateSetupCalendarRoutes(school);

  return {
    status: "success",
    schedulesNeedingTimes: readiness.schedulesNeedingTimes,
  };
}
