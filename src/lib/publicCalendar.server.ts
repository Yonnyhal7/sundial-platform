import "server-only";

import { getCalendarDayScheduleIds, type CalendarDayScheduleSummary } from "@/lib/calendarDaySchedule";
import { formatDateInTimeZone } from "@/lib/localDate";
import { buildPublicCalendarViewModel, type PublicCalendarDayRow, type PublicCalendarEventRow, type PublicCalendarPeriodRow } from "@/lib/publicCalendar";
import { requirePublicSchool } from "@/lib/publicSite";

export async function loadPublicCalendar(slug: string) {
  const { supabase, school } = await requirePublicSchool(slug);
  const today = formatDateInTimeZone(new Date(), school.timezone);
  const { data: calendarDays, error: calendarError } = await supabase
    .from("calendar_days")
    .select("id, school_id, date, label, is_school_day, schedule_id")
    .eq("school_id", school.id)
    .order("date", { ascending: true })
    .returns<PublicCalendarDayRow[]>();

  if (calendarError) console.error("Public calendar days error:", calendarError);
  const ownedDays = calendarDays || [];
  const scheduleIds = getCalendarDayScheduleIds(ownedDays);
  const startDate = ownedDays[0]?.date;
  const endDate = ownedDays[ownedDays.length - 1]?.date;

  const [scheduleResult, periodResult, eventResult] = await Promise.all([
    scheduleIds.length
      ? supabase.from("schedules").select("id, school_id, schedule_name, schedule_type, calendar_color, setup_status, active").eq("school_id", school.id).eq("active", true).in("id", scheduleIds).returns<CalendarDayScheduleSummary[]>()
      : Promise.resolve({ data: [] as CalendarDayScheduleSummary[], error: null }),
    scheduleIds.length
      ? supabase.from("periods").select("id, school_id, schedule_id, name, start_time, end_time, sort_order").eq("school_id", school.id).in("schedule_id", scheduleIds).returns<PublicCalendarPeriodRow[]>()
      : Promise.resolve({ data: [] as PublicCalendarPeriodRow[], error: null }),
    startDate && endDate
      ? supabase.from("events").select("id, school_id, title, location, event_date, start_time, end_time").eq("school_id", school.id).eq("is_active", true).gte("event_date", startDate).lte("event_date", endDate).order("event_date").returns<PublicCalendarEventRow[]>()
      : Promise.resolve({ data: [] as PublicCalendarEventRow[], error: null }),
  ]);

  if (scheduleResult.error) console.error("Public calendar schedules error:", scheduleResult.error);
  if (periodResult.error) console.error("Public calendar periods error:", periodResult.error);
  if (eventResult.error) console.error("Public calendar events error:", eventResult.error);

  return buildPublicCalendarViewModel({
    school: { id: school.id, slug, name: school.name, timezone: school.timezone },
    today,
    calendarDays: ownedDays,
    schedules: scheduleResult.data || [],
    periods: periodResult.data || [],
    events: eventResult.data || [],
  });
}
