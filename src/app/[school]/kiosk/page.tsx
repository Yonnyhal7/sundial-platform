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
  date.setHours(Number(hours), Number(minutes));

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getCurrentAndNextPeriod(periods: Period[]) {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);

  let currentPeriod: Period | null = null;
  let nextPeriod: Period | null = null;

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];

    const start = period.start_time.slice(0, 5);
    const end = period.end_time.slice(0, 5);

    if (currentTime >= start && currentTime <= end) {
      currentPeriod = period;
      nextPeriod = periods[i + 1] || null;
      break;
    }

    if (currentTime < start) {
      nextPeriod = period;
      break;
    }
  }

  return { currentPeriod, nextPeriod };
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

  const { currentPeriod, nextPeriod } = getCurrentAndNextPeriod(periods);

  const isNoSchool = calendarDay?.is_school_day === false;

  return (
    <main className="min-h-screen bg-black text-white p-10 flex flex-col justify-between">
      <div>
        <h1 className="text-5xl font-bold">{schoolData.name}</h1>

        <div className="mt-4 text-neutral-400 text-2xl">
          <p>{today}</p>
          <p>{calendarDay?.label || scheduleName}</p>
          
        </div>
      </div>

      {isNoSchool ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-3xl bg-neutral-900 p-12 text-center">
            <h2 className="text-7xl font-bold">No School Today</h2>
            <p className="text-3xl text-neutral-400 mt-6">
              {calendarDay?.label ||
                "Enjoy your day"}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-8 flex-1 mt-10">
          <div className="rounded-3xl bg-neutral-900 p-8">
            <h2 className="text-xl text-neutral-400">Current Period</h2>
            <p className="text-6xl font-bold mt-4">
              {currentPeriod?.name || "No Active Period"}
            </p>

            {currentPeriod && (
              <p className="text-2xl text-neutral-400 mt-4">
                {formatTime(currentPeriod.start_time)} -{" "}
                {formatTime(currentPeriod.end_time)}
              </p>
            )}
          </div>

          <div className="rounded-3xl bg-neutral-900 p-8">
            <h2 className="text-xl text-neutral-400">Next Period</h2>
            <p className="text-6xl font-bold mt-4">
              {nextPeriod?.name || "End of Day"}
            </p>

            {nextPeriod && (
              <p className="text-2xl text-neutral-400 mt-4">
                {formatTime(nextPeriod.start_time)} -{" "}
                {formatTime(nextPeriod.end_time)}
              </p>
            )}
          </div>

          <div className="rounded-3xl bg-neutral-900 p-8">
            <h2 className="text-xl text-neutral-400">
              Priority Announcement
            </h2>
            <h3 className="text-3xl font-bold mt-4">
              {priorityAnnouncement?.title || "No Priority Announcement"}
            </h3>
            <p className="mt-4 text-neutral-300">
              {priorityAnnouncement?.body}
            </p>
          </div>

          <div className="rounded-3xl bg-neutral-900 p-8">
            <h2 className="text-xl text-neutral-400">Upcoming Events</h2>

            <div className="mt-4 space-y-4">
              {upcomingEvents && upcomingEvents.length > 0 ? (
                upcomingEvents.map((event) => (
                  <div key={`${event.title}-${event.event_date}`}>
                    <p className="text-2xl font-semibold">{event.title}</p>
                    <p className="text-neutral-400">{event.event_date}</p>
                  </div>
                ))
              ) : (
                <p className="text-2xl text-neutral-400">
                  No Upcoming Events
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}