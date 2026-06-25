import KioskDisplay from "./KioskDisplay";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Period = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number;
};

type CalendarDay = {
  id: string;
  date: string;
  is_school_day: boolean;
  label: string | null;
  schedule_id: string | null;
};

function getTodayDateString() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default async function KioskPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const today = getTodayDateString();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{ id: string; name: string }>();

  if (!schoolData) return null;

  const { data: calendarDay } = await supabase
    .from("calendar_days")
    .select("id, date, is_school_day, label, schedule_id")
    .eq("school_id", schoolData.id)
    .eq("date", today)
    .maybeSingle<CalendarDay>();

  let scheduleName = "No Schedule Assigned";
  let periods: Period[] = [];

  if (calendarDay?.schedule_id && calendarDay.is_school_day !== false) {
    const { data: scheduleData } = await supabase
      .from("schedules")
      .select("id, name")
      .eq("id", calendarDay.schedule_id)
      .eq("school_id", schoolData.id)
      .maybeSingle<{ id: string; name: string }>();

    scheduleName = scheduleData?.name || "No Schedule Assigned";

    const { data: periodData } = await supabase
      .from("periods")
      .select("id, name, start_time, end_time, sort_order")
      .eq("schedule_id", calendarDay.schedule_id)
      .order("sort_order");

    periods = periodData || [];
  }

  const { data: priorityAnnouncement } = await supabase
    .from("announcements")
    .select("title, body")
    .eq("school_id", schoolData.id)
    .eq("priority", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("title, event_date")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .gte("event_date", today)
    .order("event_date")
    .limit(3);

  const isNoSchool = calendarDay?.is_school_day === false;

  return (
    <KioskDisplay
      schoolName={schoolData.name}
      dayType={calendarDay?.label || scheduleName}
      periods={periods.map((period) => ({
        id: period.id,
        name: period.name,
        startTime: formatTime(period.start_time),
        endTime: formatTime(period.end_time),
        rawStartTime: period.start_time,
        rawEndTime: period.end_time,
      }))}
      events={
        upcomingEvents?.map((event) => ({
          id: `${event.title}-${event.event_date}`,
          title: event.title,
          date: event.event_date,
        })) || []
      }
      announcement={
        priorityAnnouncement
          ? {
              title: priorityAnnouncement.title,
              body: priorityAnnouncement.body || "",
            }
          : null
      }
      isNoSchool={isNoSchool}
      noSchoolLabel={calendarDay?.label || "Enjoy your day"}
    />
  );
}