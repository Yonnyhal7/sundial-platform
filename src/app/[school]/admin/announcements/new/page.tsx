import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewAnnouncementPage({
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
    .rpc("get_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{ id: string; name: string; subdomain: string }>();

  if (!schoolData) {
    notFound();
  }
  const schoolId = schoolData.id;
  await requireAdminSectionAccess(schoolId, "announcements", school);

  async function createAnnouncement(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "announcements",
      school
    );

    const title = String(formData.get("title") || "");
    const body = String(formData.get("body") || "");
    const publishAt = String(formData.get("publish_at") || "");
    const priority = formData.get("priority") === "on";

    const { error } = await supabase.from("announcements").insert({
      school_id: schoolId,
      title,
      body,
      publish_at: publishAt || null,
      priority,
    });

    if (error) {
      console.error("Create announcement error:", error);
      redirect(`/${school}/admin/announcements/new?error=1`);
    }

    redirect(`/${school}/admin/announcements`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Announcement</h1>
        </div>

        {errorParam && (
          <p className="mb-6 inline-block rounded-full bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
            Something went wrong saving this announcement. Please try again.
          </p>
        )}

        <form
          action={createAnnouncement}
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
                placeholder="Example: Minimum Day Friday"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                Announcement Body
              </label>
              <textarea
                name="body"
                required
                rows={6}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
                placeholder="Write the announcement details..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                Publish Date
              </label>
              <input
                name="publish_at"
                type="date"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
              />
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#3a3a3a] dark:bg-black/30">
              <input
                name="priority"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Mark as priority announcement
              </span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-[#3a3a3a]">
            <Link
              href={`/${school}/admin/announcements`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-[var(--school-primary)] px-5 py-2 text-sm font-semibold text-[var(--school-primary-text)] transition hover:opacity-90"
            >
              Create Announcement
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
