import { notFound } from "next/navigation";
import { requireAdminSectionAccess, getSchoolAdminPath } from "@/lib/auth/adminPermissions";
import {
  AI_CALENDAR_WIZARD_DRAFT_TYPE,
  GUIDED_CALENDAR_WIZARD_DRAFT_TYPE,
  type CalendarWizardDraftType,
} from "@/lib/calendarWizard/draftPersistence";
import { normalizeScheduleSetupStatus } from "@/lib/scheduleStatus";
import { getSchoolForSetup } from "@/lib/schools";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCalendarWizardDraft } from "./actions";
import type {
  ExistingCalendarRangeSummary,
  WizardScheduleSummary,
} from "./schedule-wizard-client";

type ScheduleRow = {
  id: string;
  schedule_name: string;
  schedule_type: string | null;
  calendar_color: string | null;
  active: boolean;
  setup_status: string | null;
};

type PeriodRow = {
  schedule_id: string;
  name: string;
  start_time: string;
  end_time: string;
};

export async function loadCalendarWizardPageData(
  school: string,
  draftType: CalendarWizardDraftType
) {
  const supabase = await createSupabaseServerClient();
  const schoolData = await getSchoolForSetup(school);

  if (!schoolData) {
    notFound();
  }

  await requireAdminSectionAccess(schoolData.id, "calendar", school);

  const { data: schedules, error: schedulesError } = await supabase
    .from("schedules")
    .select("id, schedule_name, schedule_type, calendar_color, active, setup_status")
    .eq("school_id", schoolData.id)
    .eq("active", true)
    .order("schedule_name", { ascending: true })
    .returns<ScheduleRow[]>();

  if (schedulesError) {
    console.error("Schedule wizard schedules error:", JSON.stringify(schedulesError, null, 2));
  }

  const scheduleIds = (schedules || []).map((schedule) => schedule.id);
  const { data: periods, error: periodsError } = scheduleIds.length
    ? await supabase
        .from("periods")
        .select("schedule_id, name, start_time, end_time")
        .eq("school_id", schoolData.id)
        .in("schedule_id", scheduleIds)
        .order("start_time", { ascending: true })
        .returns<PeriodRow[]>()
    : { data: [], error: null };

  if (periodsError) {
    console.error("Schedule wizard periods error:", JSON.stringify(periodsError, null, 2));
  }

  const [{ data: firstCalendarDay }, { data: lastCalendarDay }] = await Promise.all([
    supabase
      .from("calendar_days")
      .select("date")
      .eq("school_id", schoolData.id)
      .order("date", { ascending: true })
      .limit(1)
      .maybeSingle<{ date: string }>(),
    supabase
      .from("calendar_days")
      .select("date")
      .eq("school_id", schoolData.id)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle<{ date: string }>(),
  ]);

  const periodMap = new Map<string, PeriodRow[]>();
  for (const period of periods || []) {
    periodMap.set(period.schedule_id, [...(periodMap.get(period.schedule_id) || []), period]);
  }

  const scheduleSummaries: WizardScheduleSummary[] = (schedules || []).map((schedule) => {
    const schedulePeriods = periodMap.get(schedule.id) || [];
    return {
      id: schedule.id,
      name: schedule.schedule_name,
      type: schedule.schedule_type,
      calendarColor: schedule.calendar_color,
      active: schedule.active,
      setupStatus: normalizeScheduleSetupStatus(schedule.setup_status, schedulePeriods),
      periodCount: schedulePeriods.length,
      firstStartTime: schedulePeriods[0]?.start_time || null,
      lastEndTime: schedulePeriods[schedulePeriods.length - 1]?.end_time || null,
    };
  });

  const existingCalendarRange: ExistingCalendarRangeSummary = {
    firstDate: firstCalendarDay?.date || null,
    lastDate: lastCalendarDay?.date || null,
  };

  const adminBasePath = await getSchoolAdminPath(school);
  const savedDraftResult = await loadCalendarWizardDraft(school, draftType);

  return {
    schoolId: schoolData.id,
    schoolSlug: school,
    schoolName: schoolData.name,
    adminBasePath,
    schedules: scheduleSummaries,
    existingCalendarRange,
    initialSavedDraft:
      savedDraftResult.status === "success" ? savedDraftResult.draft : null,
  };
}

export const AI_DRAFT_TYPE = AI_CALENDAR_WIZARD_DRAFT_TYPE;
export const GUIDED_DRAFT_TYPE = GUIDED_CALENDAR_WIZARD_DRAFT_TYPE;
