import { notFound } from "next/navigation";
import { CalendarIcon, MapPinIcon } from "@/components/mobile-app/AppIcons";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPeriodTime } from "@/lib/scheduleTime";

type School = {
  id: string;
};

type Event = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  image_url: string | null;
};

function getTodayDateString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function formatEventDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatEventTime(event: Event) {
  if (!event.start_time) return "All day";

  return event.end_time
    ? `${formatPeriodTime(event.start_time)} - ${formatPeriodTime(event.end_time)}`
    : formatPeriodTime(event.start_time);
}

export default async function MobileEventsPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<School>();

  if (!schoolData) {
    notFound();
  }

  const { data: events } = await supabase
    .from("events")
    .select("id, title, description, location, event_date, start_time, end_time, image_url")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .gte("event_date", getTodayDateString())
    .order("event_date", { ascending: true })
    .limit(12)
    .returns<Event[]>();

  const featured = events?.[0];
  const upcoming = featured ? events?.slice(1) || [] : events || [];

  return (
    <main className="space-y-5">
      <header>
        <p className="text-sm font-bold text-[var(--school-primary)]">
          Events
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          What&apos;s Coming Up
        </h1>
      </header>

      {featured ? (
        <section
          className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-900 p-6 text-white shadow-sm"
          style={{
            backgroundImage: featured.image_url
              ? `linear-gradient(180deg, rgb(15 23 42 / 0.25), rgb(15 23 42 / 0.88)), url(${featured.image_url})`
              : "linear-gradient(135deg, var(--school-primary), #111827)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <p className="text-xs font-black uppercase tracking-[0.24em] text-white/75">
            Featured Event
          </p>
          <h2 className="mt-16 text-3xl font-black tracking-tight">
            {featured.title}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-white/18 px-3 py-1.5 backdrop-blur">
              {formatEventDate(featured.event_date)}
            </span>
            <span className="rounded-full bg-white/18 px-3 py-1.5 backdrop-blur">
              {formatEventTime(featured)}
            </span>
          </div>
        </section>
      ) : (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
          <p className="text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
            No upcoming events are posted yet.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-black text-slate-950 dark:text-white">
          Upcoming Events
        </h2>

        {upcoming.map((event) => (
          <article
            key={event.id}
            className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
          >
            <div className="flex gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                <CalendarIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-slate-950 dark:text-white">
                  {event.title}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                  {formatEventDate(event.event_date)} at {formatEventTime(event)}
                </p>
                {event.location && (
                  <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                    <MapPinIcon className="h-4 w-4" />
                    {event.location}
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
