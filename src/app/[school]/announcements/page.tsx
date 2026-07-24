import { PublicContainer, PublicEmptyState, PublicPageHeader } from "@/components/public-site/PublicSite";
import { requirePublicSchool } from "@/lib/publicSite";
import { formatTimestampDateInTimeZone } from "@/lib/timezones";

export default async function AnnouncementsPage({ params }: { params: Promise<{ school: string }> }) {
  const { school: slug } = await params;
  const { supabase, school } = await requirePublicSchool(slug);
  const { data } = await supabase
    .from("announcements")
    .select("id,title,body,priority,publish_at")
    .eq("school_id", school.id)
    .eq("is_active", true)
    .lte("publish_at", new Date().toISOString())
    .order("priority", { ascending: false })
    .order("publish_at", { ascending: false });

  return (
    <main>
      <PublicPageHeader eyebrow={school.name} title="Announcements" description="News, reminders, and important updates from our school community." />
      <PublicContainer className="py-12 sm:py-16">
        {data?.length ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {data.map((item) => (
              <article key={item.id} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-[#1b1e21] dark:ring-white/10">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--school-primary)]">{item.priority ? "Featured announcement" : "School news"}</p>
                <h2 className="mt-3 text-2xl font-black">{item.title}</h2>
                <p className="mt-4 whitespace-pre-line leading-7 text-slate-600 dark:text-slate-300">{item.body}</p>
                <time className="mt-5 block text-sm text-slate-500">
                  {formatTimestampDateInTimeZone(new Date(item.publish_at), school.timezone || "America/Los_Angeles")}
                </time>
              </article>
            ))}
          </div>
        ) : <PublicEmptyState>No announcements have been posted yet.</PublicEmptyState>}
      </PublicContainer>
    </main>
  );
}
