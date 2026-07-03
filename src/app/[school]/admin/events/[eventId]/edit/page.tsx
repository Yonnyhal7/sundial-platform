import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ school: string; eventId: string }>;
}) {
  const { school, eventId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{ id: string; name: string }>();

  if (!schoolData) {
    notFound();
  }
  const schoolId = schoolData.id;
  await requireAdminSectionAccess(schoolId, "events", school);

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("school_id", schoolId)
    .single();

  if (!event) {
    notFound();
  }

  async function updateEvent(formData: FormData) {
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

    const { error } = await supabase
      .from("events")
      .update({
        title,
        description,
        location,
        event_date: eventDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        is_active: isActive,
      })
      .eq("id", eventId)
      .eq("school_id", schoolId);

    if (error) {
      console.error("Update event error:", JSON.stringify(error, null, 2));
      return;
    }

    redirect(`/${school}/admin/events`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Edit Event</h1>

        <form
          action={updateEvent}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
        >
          <div className="space-y-5">
            <input
              name="title"
              defaultValue={event.title}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <textarea
              name="description"
              defaultValue={event.description}
              rows={5}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <input
              name="location"
              defaultValue={event.location}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <div className="grid gap-5 sm:grid-cols-3">
              <input
                name="event_date"
                type="date"
                defaultValue={event.event_date}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
              />

              <input
                name="start_time"
                type="time"
                defaultValue={event.start_time}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
              />

              <input
                name="end_time"
                type="time"
                defaultValue={event.end_time || ""}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
              />
            </div>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={event.is_active}
              />
              Active
            </label>
          </div>

          <div className="mt-6 flex justify-between">
            <Link href={`/${school}/admin/events`}>
              Cancel
            </Link>

            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
