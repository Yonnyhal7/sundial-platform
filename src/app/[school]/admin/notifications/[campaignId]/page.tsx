import { notFound } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { getSchoolForSetup } from "@/lib/schools";
import { cancelNotificationCampaignAction, rescheduleNotificationCampaignAction } from "../actions";

export default async function NotificationDetails({ params }: { params: Promise<{ school: string; campaignId: string }> }) {
  const { school, campaignId } = await params;
  const schoolData = await getSchoolForSetup(school);
  if (!schoolData) notFound();
  const { supabase } = await requireAdminSectionAccess(schoolData.id, "notifications", school);
  const [{ data: campaign }, { data: audiences }, { data: audit }] = await Promise.all([
    supabase.from("notification_campaigns").select("*").eq("school_id", schoolData.id).eq("id", campaignId).maybeSingle(),
    supabase.from("notification_campaign_audiences").select("audience").eq("school_id", schoolData.id).eq("campaign_id", campaignId),
    supabase.from("notification_audit").select("id,action,summary,result_status,created_at").eq("school_id", schoolData.id).eq("campaign_id", campaignId).order("created_at", { ascending: false }),
  ]);
  if (!campaign) notFound();
  const cancel = cancelNotificationCampaignAction.bind(null, school, campaignId, campaign.version);
  const reschedule = rescheduleNotificationCampaignAction.bind(null, school, campaignId, campaign.version);

  return <main className="mx-auto max-w-4xl px-6 py-8 text-slate-950 dark:text-white">
    <p className="text-sm text-slate-500">{schoolData.name} notification</p>
    <div className="flex items-start justify-between gap-4"><h1 className="text-3xl font-bold">{campaign.title}</h1><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold capitalize dark:bg-[#333]">{campaign.status.replace("_"," ")}</span></div>
    <section className="mt-6 rounded-2xl border bg-white p-6 dark:border-[#3a3a3a] dark:bg-[#242424]">
      <p>{campaign.body}</p>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Category</dt><dd className="font-bold">{campaign.category}</dd></div>
        <div><dt className="text-slate-500">Audience</dt><dd className="font-bold">{audiences?.map((row) => row.audience).join(", ")}</dd></div>
        <div><dt className="text-slate-500">Eligible / attempted</dt><dd className="font-bold">{campaign.eligible_count} / {campaign.attempted_count}</dd></div>
        <div><dt className="text-slate-500">Sent / failed / disabled</dt><dd className="font-bold">{campaign.successful_count} / {campaign.failed_count} / {campaign.disabled_subscription_count}</dd></div>
      </dl>
      {["draft","scheduled"].includes(campaign.status) && <form action={reschedule} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-bold">Schedule in {schoolData.timezone || "America/Los_Angeles"}<input required type="datetime-local" name="scheduled_for" className="mt-2 block rounded-lg border p-2 dark:bg-black" /></label>
        <button className="rounded-lg border px-4 py-2 font-bold">Save schedule</button>
      </form>}
      {["draft","scheduled","queued"].includes(campaign.status) && <form action={cancel} className="mt-6"><button className="rounded-lg border border-red-300 px-4 py-2 font-bold text-red-700">Cancel notification</button></form>}
    </section>
    <h2 className="mt-8 text-xl font-bold">Audit history</h2>
    <div className="mt-3 rounded-2xl border bg-white dark:border-[#3a3a3a] dark:bg-[#242424]">{audit?.map((row) => <div key={row.id} className="border-b p-4 last:border-0 dark:border-[#3a3a3a]"><p className="font-bold">{row.summary}</p><p className="text-xs text-slate-500">{new Date(row.created_at).toLocaleString()} · {row.result_status}</p></div>)}</div>
  </main>;
}
