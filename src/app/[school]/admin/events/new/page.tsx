import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewEventPage({
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

  async function createEvent(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const title = String(formData.get("title") || "");
    const description = String(formData.get("description") || "");
    const location = String(formData.get("location") || "");
    const eventDate = String(formData.get("event_date") || "");
    const startTime = String(formData.get("start_time") || "");
    const endTime = String(formData.get("end_time") || "");
    const isActive = formData.get("is_active") === "on";

    const { error } = await supabase.from("events").insert({
      school_id: schoolId,
      title,
      description,
      location,
      event_date: eventDate || null,
      start_time: startTime || null,
      end_time: endTime || null,
      is_active: isActive,
    });

    if (error) {
      console.error("Create event error:", JSON.stringify(error, null, 2));
      return;
    }

    redirect(`/${school}/admin/events`);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Event</h1>
        </div>

        <form
          action={createEvent}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
        >
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Title
              </label>
              <input
                name="title"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                placeholder="Example: Back to School Night"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Description
              </label>
              <textarea
                name="description"
                rows={5}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                placeholder="Write event details..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Location
              </label>
              <input
                name="location"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                placeholder="Example: Main Gym"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Event Date
                </label>
                <input
                  name="event_date"
                  type="date"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Start Time
                </label>
                <input
                  name="start_time"
                  type="time"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  End Time
                </label>
                <input
                  name="end_time"
                  type="time"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
              <input
                name="is_active"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-slate-600"
              />
              <span className="text-sm text-slate-300">
                Active and visible
              </span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-5">
            <Link
              href={`/${school}/admin/events`}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Create Event
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}