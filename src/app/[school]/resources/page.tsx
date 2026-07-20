import { PublicContainer, PublicEmptyState, PublicPageHeader } from "@/components/public-site/PublicSite";
import { requirePublicSchool } from "@/lib/publicSite";
import { safePublicUrl } from "@/lib/publicUrl";

export default async function ResourcesPage({ params }: { params: Promise<{ school: string }> }) {
  const { school: slug } = await params; const { supabase, school } = await requirePublicSchool(slug);
  const { data } = await supabase.from("resources").select("id,title,description,url,file_url,category").eq("school_id", school.id).eq("is_active", true).order("category").order("title");
  return <main><PublicPageHeader eyebrow={school.name} title="Resources" description="Helpful links and documents for students, families, staff, and visitors." /><PublicContainer className="py-12 sm:py-16">{data?.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{data.map((resource) => { const href = safePublicUrl(resource.url) || safePublicUrl(resource.file_url); return <article key={resource.id} className="flex min-h-56 flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-[#1b1e21] dark:ring-white/10"><p className="text-xs font-bold uppercase tracking-wider text-[var(--school-primary)]">{resource.category || "Resource"}</p><h2 className="mt-3 text-xl font-black">{resource.title}</h2>{resource.description && <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">{resource.description}</p>}{href && <a href={href} target="_blank" rel="noreferrer" className="mt-auto pt-6 text-sm font-black text-[var(--school-primary)]">Open resource <span aria-label="Opens in a new tab">↗</span></a>}</article>; })}</div> : <PublicEmptyState>No resources are available yet.</PublicEmptyState>}</PublicContainer></main>;
}
