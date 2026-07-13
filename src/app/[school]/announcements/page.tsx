import { createSupabaseServerClient } from "@/lib/supabase/server";

type Announcement = {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  priority: boolean;
  publish_at: string;
};

export default async function AnnouncementsPage({
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
    .single<{ id: string }>();

  if (!schoolData) {
    return null;
  }

  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, image_url, priority, publish_at")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("publish_at", { ascending: false });

  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold">Announcements</h1>

      <div className="mt-8 space-y-6">
        {announcements?.map((announcement) => (
          <article
            key={announcement.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
          >
            <div className="flex items-center gap-2">
              {announcement.priority && <span>⭐</span>}
              <h2 className="text-2xl font-semibold">
                {announcement.title}
              </h2>
            </div>

            <p className="mt-4 text-neutral-300">{announcement.body}</p>

            {announcement.image_url && (
              <img
                src={announcement.image_url}
                alt={announcement.title}
                className="mt-4 rounded-xl"
              />
            )}

            <p className="mt-4 text-sm text-neutral-500">
              Posted: {new Date(announcement.publish_at).toLocaleDateString()}
            </p>
          </article>
        ))}

        {!announcements?.length && (
          <p className="text-neutral-400">No announcements available.</p>
        )}
      </div>
    </main>
  );
}
