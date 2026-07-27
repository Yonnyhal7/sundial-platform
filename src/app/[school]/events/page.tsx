import type { Metadata } from "next";
import { PublicContainer, PublicEmptyState, PublicPageHeader } from "@/components/public-site/PublicSite";
import { publicDensity } from "@/components/public-site/publicDensity";
import { formatDateInTimeZone } from "@/lib/localDate";
import { requirePublicSchool } from "@/lib/publicSite";
import { formatPeriodTime } from "@/lib/scheduleTime";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage({ params }: { params: Promise<{ school: string }> }) {
  const { school: slug } = await params; const { supabase, school } = await requirePublicSchool(slug); const today = formatDateInTimeZone(new Date(), school.timezone);
  const { data } = await supabase.from("events").select("id,title,description,location,event_date,start_time,end_time").eq("school_id", school.id).eq("is_active", true).gte("event_date", today).order("event_date");
  return <main><PublicPageHeader eyebrow={school.name} title="Upcoming events" description="Dates and details for what’s happening across our school." /><PublicContainer className={publicDensity.pageSection}>{data?.length ? <div className="space-y-3">{data.map((event) => { const date = new Date(`${event.event_date}T12:00:00`); return <article key={event.id} className={`grid rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-[#1b1e21] dark:ring-white/10 sm:grid-cols-[4.5rem_1fr] ${publicDensity.card} gap-4`}><time className="grid h-16 place-content-center rounded-2xl bg-[var(--school-primary)] text-center text-[var(--school-primary-text)]"><span className="text-xs font-black uppercase">{date.toLocaleDateString("en-US", { month: "short" })}</span><span className="text-xl font-black">{date.getDate()}</span></time><div><h2 className="text-lg font-black">{event.title}</h2><p className="mt-1.5 text-sm font-semibold text-slate-500">{event.start_time ? formatPeriodTime(event.start_time) : "All day"}{event.end_time ? ` – ${formatPeriodTime(event.end_time)}` : ""}{event.location ? ` · ${event.location}` : ""}</p>{event.description && <p className="mt-2 leading-6 text-slate-600 dark:text-slate-300">{event.description}</p>}</div></article>; })}</div> : <PublicEmptyState>No upcoming events are posted right now.</PublicEmptyState>}</PublicContainer></main>;
}
