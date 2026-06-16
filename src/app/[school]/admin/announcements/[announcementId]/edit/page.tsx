import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ school: string; announcementId: string }>;
}) {
  const { school, announcementId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{ id: string; name: string }>();

  if (!schoolData) notFound();

  const { data: announcement } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", announcementId)
    .eq("school_id", schoolData.id)
    .single();

    if (!announcement) {
    notFound();
    }

  async function updateAnnouncement(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const title = String(formData.get("title") || "");
    const body = String(formData.get("body") || "");
    const publishDate = String(formData.get("publish_date") || "");
    const priority = formData.get("priority") === "on";

    const { error } = await supabase
      .from("announcements")
      .update({
        title,
        body,
        publish_at: publishDate || null,
        priority,
      })
      .eq("id", announcementId);

    if (error) {
      console.error("Update announcement error:", error);
      return;
    }

    redirect(`/${school}/admin/announcements`);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Edit Announcement</h1>

        <form
          action={updateAnnouncement}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
        >
          <div className="space-y-5">
            <input
              name="title"
              defaultValue={announcement.title}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <textarea
              name="body"
              defaultValue={announcement.body}
              rows={6}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <input
              name="publish_date"
              type="date"
              defaultValue={
                announcement.publish_at
                  ? announcement.publish_at.split("T")[0]
                  : ""
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="priority"
                defaultChecked={announcement.priority}
              />
              Priority
            </label>
          </div>

          <div className="mt-6 flex justify-between">
            <Link href={`/${school}/admin/announcements`}>
              Cancel
            </Link>

            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}