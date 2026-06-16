import { createSupabaseServerClient } from "@/lib/supabase/server";

type Period = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number;
};

function getCurrentAndNextPeriod(periods: Period[]) {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);

  let currentPeriod: Period | null = null;
  let nextPeriod: Period | null = null;

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];

    if (
      currentTime >= period.start_time.slice(0, 5) &&
      currentTime <= period.end_time.slice(0, 5)
    ) {
      currentPeriod = period;
      nextPeriod = periods[i + 1] || null;
      break;
    }

    if (currentTime < period.start_time.slice(0, 5)) {
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

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{ id: string; name: string }>();

  if (!schoolData) return null;

  const { data: schedule } = await supabase
    .from("schedules")
    .select("id")
    .eq("school_id", schoolData.id)
    .eq("is_default", true)
    .single<{ id: string }>();

  const { data: periods } = await supabase
    .from("periods")
    .select("*")
    .eq("schedule_id", schedule?.id)
    .order("sort_order");

  const { data: priorityAnnouncement } = await supabase
    .from("announcements")
    .select("title, body")
    .eq("school_id", schoolData.id)
    .eq("priority", true)
    .eq("is_active", true)
    .limit(1)
    .single();

  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("title, event_date")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .gte("event_date", new Date().toISOString().slice(0, 10))
    .order("event_date")
    .limit(3);

  const { currentPeriod, nextPeriod } = getCurrentAndNextPeriod(periods || []);

  return (
    <main className="min-h-screen bg-black text-white p-10 flex flex-col justify-between">
      <div>
        <h1 className="text-5xl font-bold">{schoolData.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-8 flex-1 mt-10">
        <div className="rounded-3xl bg-neutral-900 p-8">
          <h2 className="text-xl text-neutral-400">Current Period</h2>
          <p className="text-6xl font-bold mt-4">
            {currentPeriod?.name || "No Active Period"}
          </p>
        </div>

        <div className="rounded-3xl bg-neutral-900 p-8">
          <h2 className="text-xl text-neutral-400">Next Period</h2>
          <p className="text-6xl font-bold mt-4">
            {nextPeriod?.name || "End of Day"}
          </p>
        </div>

        <div className="rounded-3xl bg-neutral-900 p-8">
          <h2 className="text-xl text-neutral-400">Priority Announcement</h2>
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
            {upcomingEvents?.map((event) => (
              <div key={event.title}>
                <p className="text-2xl font-semibold">{event.title}</p>
                <p className="text-neutral-400">{event.event_date}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}