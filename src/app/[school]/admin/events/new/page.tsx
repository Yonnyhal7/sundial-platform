import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { school } = await params;
  const { error: errorParam } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_available_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{ id: string; name: string; subdomain: string }>();

  if (!schoolData) {
    notFound();
  }

  const schoolId = schoolData.id;
  await requireAdminSectionAccess(schoolId, "events", school);

  async function createEvent(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "events",
      school
    );

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
      redirect(`/${school}/admin/events/new?error=1`);
    }

    redirect(`/${school}/admin/events`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Event</h1>
        </div>

        {errorParam && (
          <p className="mb-6 inline-block rounded-full bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
            Something went wrong saving this event. Please try again.
          </p>
        )}

        <form
          action={createEvent}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
        >
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                Title
              </label>
              <input
                name="title"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
                placeholder="Example: Back to School Night"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                Description
              </label>
              <textarea
                name="description"
                rows={5}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
                placeholder="Write event details..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                Location
              </label>
              <input
                name="location"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
                placeholder="Example: Main Gym"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                  Event Date
                </label>
                <input
                  name="event_date"
                  type="date"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                  Start Time
                </label>
                <input
                  name="start_time"
                  type="time"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                  End Time
                </label>
                <input
                  name="end_time"
                  type="time"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#3a3a3a] dark:bg-black/30">
              <input
                name="is_active"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Active and visible
              </span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-[#3a3a3a]">
            <Link
              href={`/${school}/admin/events`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-[var(--school-primary)] px-5 py-2 text-sm font-semibold text-[var(--school-primary-text)] transition hover:opacity-90"
            >
              Create Event
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
