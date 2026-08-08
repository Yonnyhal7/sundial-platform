import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import AdminEventsList, {
  type AdminEventListItem,
  type FeaturedEventActionResult,
} from "@/components/admin/AdminEventsList";

export default async function AdminEventsPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
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

  async function deleteEvent(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "events",
      school
    );

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

  async function setFeaturedEvent(
    eventId: string,
    featured: boolean
  ): Promise<FeaturedEventActionResult> {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "events",
      school
    );
    const { error } = await supabase.rpc("set_school_featured_event", {
      p_school_id: schoolId,
      p_event_id: eventId,
      p_featured: featured,
    });

    if (error) {
      console.error("Set featured event error:", JSON.stringify(error, null, 2));
      return {
        status: "error",
        message: "Featured event could not be updated. Please try again.",
      };
    }

    return {
      status: "success",
      message: featured ? "Featured event updated." : "Featured event removed.",
    };
  }
  const { data: events, error } = await supabase
    .from("events")
    .select(
        "id, title, description, location, event_date, start_time, end_time, image_url, is_active, is_featured, created_at"
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
            <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
            <h1 className="mt-1 text-3xl font-bold">Events</h1>
          </div>

        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Manage Events</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                View school events. Create, edit, and delete tools come next.
              </p>
            </div>

            <Link
              href={`/${school}/admin/events/new`}
              className="cursor-pointer rounded-lg bg-[var(--school-primary)] px-4 py-2 text-sm font-medium text-[var(--school-primary-text)] transition hover:opacity-90"
            >
              + New Event
            </Link>
          </div>
        </div>

        <AdminEventsList
          school={school}
          events={(events || []) as AdminEventListItem[]}
          setFeaturedAction={setFeaturedEvent}
          deleteAction={deleteEvent}
        />
      </div>
    </main>
  );
}
