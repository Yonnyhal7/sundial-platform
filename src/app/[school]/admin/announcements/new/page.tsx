import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewAnnouncementPage({
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
  async function createAnnouncement(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

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
      return;
    }

    redirect(`/${school}/admin/announcements`);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Announcement</h1>
        </div>

        <form
          action={createAnnouncement}
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
                placeholder="Example: Minimum Day Friday"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Announcement Body
              </label>
              <textarea
                name="body"
                required
                rows={6}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                placeholder="Write the announcement details..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Publish Date
              </label>
              <input
                name="publish_at"
                type="date"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
              <input
                name="priority"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-600"
              />
              <span className="text-sm text-slate-300">
                Mark as priority announcement
              </span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-5">
            <Link
              href={`/${school}/admin/announcements`}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Create Announcement
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}