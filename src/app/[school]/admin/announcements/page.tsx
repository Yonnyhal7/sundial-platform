import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminAnnouncementsPage({
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
  await requireAdminSectionAccess(schoolId, "announcements", school);

  async function deleteAnnouncement(formData: FormData) {
  "use server";

  const { supabase } = await requireAdminSectionAccess(
    schoolId,
    "announcements",
    school
  );

  const announcementId = String(formData.get("announcement_id") || "");

  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId)
    .eq("school_id", schoolId);

  if (error) {
    console.error("Delete announcement error:", error);
  }
  revalidatePath(`/${school}/admin/announcements`);
}

  const { data: announcements, error } = await supabase
    .from("announcements")
    .select("id, title, body, priority, publish_at, created_at")
    .eq("school_id", schoolData.id)
    .order("publish_at", { ascending: false });

  if (error) {
    console.error("Admin announcements error:", JSON.stringify(error, null, 2));
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
            <h1 className="mt-1 text-3xl font-bold">Announcements</h1>
          </div>

        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Manage Announcements</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                View school announcements. Create, edit, and delete tools come next.
              </p>
            </div>


            <Link
                href={`/${school}/admin/announcements/new`}
                className="inline-flex w-fit max-w-full cursor-pointer items-center justify-center rounded-lg bg-[var(--school-primary)] px-3 py-2 text-sm font-medium leading-tight text-[var(--school-primary-text)] transition hover:opacity-90 sm:shrink-0"
                >
                <span className="hidden sm:inline">+ New Announcement</span>
                <span className="sm:hidden">+ New</span>
            </Link>

          </div>
        </div>

        <section className="space-y-4">
          {!announcements || announcements.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
              <h3 className="text-lg font-semibold">No announcements yet</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Once announcements are created, they will appear here.
              </p>
            </div>
          ) : (
            announcements.map((announcement) => (
              <article
                key={announcement.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-semibold">
                        {announcement.title}
                      </h3>

                      {announcement.priority && (
                        <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
                          Priority
                        </span>
                      )}
                    </div>

                    <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                      {announcement.body}
                    </p>
                  </div>

                  <div className="text-left text-sm text-slate-500 dark:text-slate-400 sm:text-right">
                    <p>Publish Date</p>
                    <p className="font-medium text-slate-900 dark:text-slate-200">
                      {announcement.publish_at
                        ? new Date(
                            announcement.publish_at
                          ).toLocaleDateString()
                        : "Not set"}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex gap-3 border-t border-slate-200 pt-4 dark:border-[#3a3a3a]">
                  <Link
                    href={`/${school}/admin/announcements/${announcement.id}/edit`}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
                    >
                    Edit
                    </Link>

                  <form action={deleteAnnouncement}>
                    <input
                        type="hidden"
                        name="announcement_id"
                        value={announcement.id}
                    />

                    <button
                        type="submit"
                        className="cursor-pointer rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
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
