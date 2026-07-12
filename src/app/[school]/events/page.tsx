import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateInTimeZone } from "@/lib/localDate";

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

export default async function EventsPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<{ id: string; timezone: string | null }>();

  if (!schoolData) return null;

  const { data: events } = await supabase
    .from("events")
    .select("id, title, description, location, event_date, start_time, end_time, image_url")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .gte("event_date", formatDateInTimeZone(new Date(), schoolData.timezone))
    .order("event_date", { ascending: true });

  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold">Events</h1>

      <div className="mt-8 space-y-6">
        {events?.map((event) => (
          <article
            key={event.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
          >
            <h2 className="text-2xl font-semibold">{event.title}</h2>

            <p className="mt-3 text-neutral-300">
              {new Date(`${event.event_date}T00:00:00`).toLocaleDateString()}
              {event.start_time ? ` at ${event.start_time}` : ""}
              {event.end_time ? ` - ${event.end_time}` : ""}
            </p>

            {event.location && (
              <p className="mt-2 text-neutral-400">{event.location}</p>
            )}

            {event.description && (
              <p className="mt-4 text-neutral-300">{event.description}</p>
            )}

            {event.image_url && (
              <img
                src={event.image_url}
                alt={event.title}
                className="mt-4 rounded-xl"
              />
            )}
          </article>
        ))}

        {!events?.length && (
          <p className="text-neutral-400">No upcoming events.</p>
        )}
      </div>
    </main>
  );
}
