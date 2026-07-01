import KioskDisplay from "./KioskDisplay";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Period = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number | null;
};

type CalendarDay = {
  id: string;
  date: string;
  is_school_day: boolean;
  label: string | null;
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
    .single<{ id: string; name: string; primary_color: string | null }>();

  if (!schoolData) return null;

  const { data: calendarDay } = await supabase
    .from("calendar_days")
    .select(
      `
      id,
      date,
      is_school_day,
      label,
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

  const assignedSchedule = Array.isArray(calendarDay?.schedule)
    ? calendarDay?.schedule[0]
    : calendarDay?.schedule;
  const scheduleName = assignedSchedule?.schedule_name || "No Schedule Assigned";
  const scheduleType = assignedSchedule?.schedule_type || "";
  const dayType = scheduleType ? `${scheduleName} (${scheduleType})` : scheduleName;
  let periods: Period[] = [];

  if (calendarDay?.schedule_id && calendarDay.is_school_day !== false) {
    const { data: periodData } = await supabase
      .from("periods")
      .select("id, name, start_time, end_time, sort_order")
      .eq("schedule_id", calendarDay.schedule_id)
      .order("sort_order", { ascending: true })
      .order("start_time", { ascending: true });

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
      schoolPrimaryColor={schoolData.primary_color || "#2563eb"}
      dayType={dayType}
      periods={periods.map((period) => ({
        id: period.id,
        name: period.name,
        startTime: formatTime(period.start_time),
        endTime: formatTime(period.end_time),
        rawStartTime: period.start_time,
        rawEndTime: period.end_time,
        sortOrder: period.sort_order,
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
