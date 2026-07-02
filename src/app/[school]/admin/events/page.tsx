import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export default async function AdminEventsPage({
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
    .single<{ id: string; name: string; subdomain: string }>();

  if (!schoolData) {
    notFound();
  }
  const schoolId = schoolData.id;
  async function deleteEvent(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const eventId = String(formData.get("event_id") || "");

    const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId)
        .eq("school_id", schoolId);

    if (error) {
        console.error("Delete event error:", JSON.stringify(error, null, 2));
        return;
    }
    revalidatePath(`/${school}/admin/events`);
  }
  const { data: events, error } = await supabase
    .from("events")
    .select(
        "id, title, description, location, event_date, start_time, end_time, image_url, is_active, created_at"
    )
    .eq("school_id", schoolId)
    .order("event_date", { ascending: true });

  if (error) {
    console.error("Admin events error:", JSON.stringify(error, null, 2));
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">{schoolData.name} Admin</p>
            <h1 className="mt-1 text-3xl font-bold">Events</h1>
          </div>

          <Link
            href={`/${school}/admin`}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
          >
            Back to Admin
          </Link>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Manage Events</h2>
              <p className="mt-1 text-sm text-slate-400">
                View school events. Create, edit, and delete tools come next.
              </p>
            </div>

            <Link
              href={`/${school}/admin/events/new`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              + New Event
            </Link>
          </div>
        </div>

        <section className="space-y-4">
          {!events || events.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
              <h3 className="text-lg font-semibold">No events yet</h3>
              <p className="mt-2 text-sm text-slate-400">
                Once events are created, they will appear here.
              </p>
            </div>
          ) : (
            events.map((event) => (
              <article
                key={event.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-semibold">{event.title}</h3>

                      {event.is_active && (
                        <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-300 ring-1 ring-green-500/30">
                          Active
                        </span>
                      )}
                    </div>

                    <p className="mt-2 line-clamp-2 text-sm text-slate-300">
                      {event.description}
                    </p>

                    {event.location && (
                      <p className="mt-2 text-sm text-slate-400">
                        Location: {event.location}
                      </p>
                    )}
                  </div>

                  <div className="text-left text-sm text-slate-400 sm:text-right">
                    <p>Starts</p>
                    <p className="font-medium text-slate-200">
                      {event.event_date
                        ? new Date(`${event.event_date}T00:00:00`).toLocaleDateString()
                        : "Not set"}
                    </p>
                    <p className="text-slate-300">
                        {event.start_time
                            ? new Date(`2000-01-01T${event.start_time}`).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                            })
                            : ""}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex gap-3 border-t border-slate-800 pt-4">
                  <Link
                    href={`/${school}/admin/events/${event.id}/edit`}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                    >
                    Edit
                  </Link>

                  <form action={deleteEvent}>
                    <input
                        type="hidden"
                        name="event_id"
                        value={event.id}
                    />

                    <button
                        type="submit"
                        className="rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40"
                    >
                        Delete
                    </button>
                    </form>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}