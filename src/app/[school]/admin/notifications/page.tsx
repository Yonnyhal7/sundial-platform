import Link from "next/link";
import { notFound } from "next/navigation";
import { getSchoolAdminPath, requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { getSchoolForSetup } from "@/lib/schools";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

export default async function NotificationsPage({ params, searchParams }: { params: Promise<{ school: string }>; searchParams: Promise<{ view?: string }> }) {
  const { school } = await params;
  const schoolData = await getSchoolForSetup(school);
  if (!schoolData) notFound();
  const { supabase } = await requireAdminSectionAccess(schoolData.id, "notifications", school);
  const view = (await searchParams).view || "overview";
  const statusMap: Record<string,string[]> = { scheduled: ["scheduled","queued","sending"], sent: ["sent","partially_failed","failed"], drafts: ["draft"] };
  let query = supabase.from("notification_campaigns").select("id,title,body,category,status,scheduled_for,sent_at,created_at,eligible_count,successful_count,failed_count").eq("school_id", schoolData.id).order("created_at", { ascending: false }).limit(100);
  if (statusMap[view]) query = query.in("status", statusMap[view]);
  const { data: campaigns } = await query;
  const db = createSupabaseServiceRoleClient();
  const [{ count: devices }, { count: subscriptions }] = await Promise.all([
    db.from("notification_devices").select("id", { count: "exact", head: true }).eq("school_id", schoolData.id).is("revoked_at", null),
    db.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("school_id", schoolData.id).is("disabled_at", null),
  ]);
  const base = `${await getSchoolAdminPath(school)}/notifications`;
  return <main className="mx-auto max-w-6xl px-6 py-8 text-slate-950 dark:text-white">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-slate-500">{schoolData.name} Admin</p><h1 className="text-3xl font-bold">Notifications</h1></div><div className="flex gap-2"><Link href={`${base}/settings`} className="rounded-lg border px-4 py-2 font-bold">Settings</Link><Link href={`${base}/new`} className="rounded-lg bg-[var(--school-primary)] px-4 py-2 font-bold text-[var(--school-primary-text)]">Create notification</Link></div></header>
    <section className="mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border bg-white p-5 dark:border-[#3a3a3a] dark:bg-[#242424]"><p className="text-sm text-slate-500">Registered devices</p><p className="mt-1 text-3xl font-black">{devices || 0}</p></div><div className="rounded-2xl border bg-white p-5 dark:border-[#3a3a3a] dark:bg-[#242424]"><p className="text-sm text-slate-500">Active push subscriptions</p><p className="mt-1 text-3xl font-black">{subscriptions || 0}</p></div><div className="rounded-2xl border bg-white p-5 dark:border-[#3a3a3a] dark:bg-[#242424]"><p className="text-sm text-slate-500">Recent campaigns</p><p className="mt-1 text-3xl font-black">{campaigns?.length || 0}</p></div></section>
    <nav className="mt-6 flex flex-wrap gap-2">{["overview","scheduled","sent","drafts"].map((item) => <Link key={item} href={item === "overview" ? base : `${base}?view=${item}`} className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${view === item ? "bg-slate-950 text-white dark:bg-white dark:text-black" : "border"}`}>{item}</Link>)}</nav>
    <section className="mt-5 overflow-hidden rounded-2xl border bg-white dark:border-[#3a3a3a] dark:bg-[#242424]">{campaigns?.length ? campaigns.map((campaign) => <Link href={`${base}/${campaign.id}`} key={campaign.id} className="flex items-center justify-between gap-4 border-b p-5 last:border-0 dark:border-[#3a3a3a]"><div><h2 className="font-bold">{campaign.title}</h2><p className="mt-1 line-clamp-1 text-sm text-slate-500">{campaign.body}</p></div><div className="text-right"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize dark:bg-[#333]">{campaign.status.replace("_"," ")}</span><p className="mt-2 text-xs text-slate-500">{campaign.successful_count} sent · {campaign.failed_count} failed</p></div></Link>) : <p className="p-8 text-center text-slate-500">No notifications in this view.</p>}</section>
  </main>;
}
