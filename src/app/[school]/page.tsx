import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import SchoolLogo from "@/components/SchoolLogo";
import { formatDateInTimeZone } from "@/lib/localDate";

type School = {
  id: string;
  name: string;
  subdomain: string;
  mascot: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  timezone: string;
};

export default async function SchoolPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData, error: schoolError } = await supabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<School>();

  if (schoolError || !schoolData) {
    notFound();
  }

  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, priority, publish_at")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("publish_at", { ascending: false })
    .limit(3);

  const { data: events } = await supabase
    .from("events")
    .select("id, title, event_date, start_time, location")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .gte("event_date", formatDateInTimeZone(new Date(), schoolData.timezone))
    .order("event_date", { ascending: true })
    .limit(3);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section
        className="px-6 py-10"
        style={{ borderTop: `8px solid ${schoolData.primary_color}` }}
      >
        <div className="flex items-center gap-4">
          <SchoolLogo schoolName={schoolData.name} logoUrl={schoolData.logo_url} size="lg" />
          <div>
            <p className="text-sm uppercase tracking-widest text-neutral-400">
              Sundial
            </p>
            <h1 className="mt-2 text-4xl font-bold">{schoolData.name}</h1>
            <p className="mt-2 text-neutral-300">Home of the {schoolData.mascot}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 px-6 pb-10 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-2xl font-semibold">Announcements</h2>

          <div className="mt-4 space-y-4">
            {announcements?.map((item) => (
              <article key={item.id} className="rounded-xl bg-neutral-800 p-4">
                <h3 className="font-semibold">
                  {item.priority ? "⭐ " : ""}
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-neutral-300">{item.body}</p>
              </article>
            ))}

            {!announcements?.length && (
              <p className="text-neutral-400">No announcements yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-2xl font-semibold">Upcoming Events</h2>

          <div className="mt-4 space-y-4">
            {events?.map((event) => (
              <article key={event.id} className="rounded-xl bg-neutral-800 p-4">
                <h3 className="font-semibold">{event.title}</h3>
                <p className="mt-2 text-sm text-neutral-300">
                  {event.event_date}
                  {event.start_time ? ` at ${event.start_time}` : ""}
                </p>
                {event.location && (
                  <p className="text-sm text-neutral-400">{event.location}</p>
                )}
              </article>
            ))}

            {!events?.length && (
              <p className="text-neutral-400">No upcoming events yet.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
