import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDaysToLocalDateString,
  formatDateInTimeZone,
} from "@/lib/localDate";
import {
  getNextPeriodReminder,
  resolvePeriodReminderCandidates,
  type PeriodReminderSettings,
} from "./periodReminders";

export type PeriodReminderSettingsRow = PeriodReminderSettings & {
  version: number;
  scheduled_notifications_enabled: boolean;
  sender_display_name: string | null;
};

export async function getPeriodReminderAdminStatus({
  supabase,
  schoolId,
  schoolSlug,
  timeZone,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  schoolId: string;
  schoolSlug: string;
  timeZone: string;
  now?: Date;
}) {
  const { data: settings } = await supabase
    .from("notification_school_settings")
    .select("*")
    .eq("school_id", schoolId)
    .single<PeriodReminderSettingsRow>();
  if (!settings) return null;

  const today = formatDateInTimeZone(now, timeZone);
  const endDate = addDaysToLocalDateString(today, 14);
  const { data: days } = await supabase
    .from("calendar_days")
    .select("school_id,date,schedule_id,is_school_day")
    .eq("school_id", schoolId)
    .gte("date", today)
    .lte("date", endDate)
    .order("date");
  const scheduleIds = [
    ...new Set(
      (days || [])
        .map((day) => day.schedule_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [{ data: schedules }, { data: periods }] = scheduleIds.length
    ? await Promise.all([
        supabase
          .from("schedules")
          .select("id,school_id,active,setup_status")
          .eq("school_id", schoolId)
          .in("id", scheduleIds),
        supabase
          .from("periods")
          .select(
            "id,school_id,schedule_id,name,start_time,end_time,sort_order",
          )
          .eq("school_id", schoolId)
          .in("schedule_id", scheduleIds),
      ])
    : [{ data: [] }, { data: [] }];
  const scheduleById = new Map(
    (schedules || []).map((schedule) => [schedule.id, schedule]),
  );
  const next = getNextPeriodReminder(
    (days || []).flatMap((day) =>
      resolvePeriodReminderCandidates({
        school: { id: schoolId, subdomain: schoolSlug, timezone: timeZone },
        settings,
        calendarDay: day,
        schedule: day.schedule_id
          ? scheduleById.get(day.schedule_id) || null
          : null,
        periods: (periods || []).filter(
          (period) => period.schedule_id === day.schedule_id,
        ),
      }),
    ),
    now,
  );
  return { settings, next, now };
}
