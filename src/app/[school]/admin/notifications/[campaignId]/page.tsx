import { notFound } from "next/navigation";
import { getSchoolAdminPath, requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { getSchoolForSetup } from "@/lib/schools";
import { cancelNotificationCampaignAction, rescheduleNotificationCampaignAction } from "../actions";
import NotificationBackButton from "@/components/admin/NotificationBackButton";
import NotificationPendingRecoveryActions from "@/components/admin/NotificationPendingRecoveryActions";
import {
  getNotificationAudienceListLabel,
  getNotificationCategoryLabel,
} from "@/lib/notifications";
import { formatTimestampInTimeZone } from "@/lib/timezones";
import {
  getCampaignDeliverySummary,
  getCampaignDisplayStatus,
  getCampaignStatusLabel,
} from "@/lib/notifications/campaignStatus";

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
  const notificationsHref = `${await getSchoolAdminPath(school)}/notifications`;
  const timeZone = schoolData.timezone || "America/Los_Angeles";
  const audienceValues = audiences?.map((row) => row.audience) || [];
  const audienceLabel = getNotificationAudienceListLabel(audienceValues);
  const displayStatus = getCampaignDisplayStatus(campaign);
  const deliverySummary = getCampaignDeliverySummary(campaign);

  return <main className="mx-auto max-w-4xl px-6 py-8 text-slate-950 dark:text-white">
    <NotificationBackButton fallbackHref={notificationsHref} />
    <p className="text-sm text-slate-500">{schoolData.name} notification</p>
    <div className="flex items-start justify-between gap-4">
      <h1 className="text-3xl font-bold">{campaign.title}</h1>
      <span
        id="campaign-status-badge"
        tabIndex={-1}
        aria-label={`Status: ${getCampaignStatusLabel(displayStatus)}`}
        className={`rounded-full px-3 py-1 text-sm font-bold ${
          displayStatus === "action_required"
            ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
            : "bg-slate-100 dark:bg-[#333]"
        }`}
      >
        {getCampaignStatusLabel(displayStatus)}
      </span>
    </div>
    <section className="mt-6 rounded-2xl border bg-white p-6 dark:border-[#3a3a3a] dark:bg-[#242424]">
      <p>{campaign.body}</p>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Category</dt><dd className="font-bold">{getNotificationCategoryLabel(campaign.category)}</dd></div>
        <div><dt className="text-slate-500">Audience</dt><dd className="font-bold">{audienceLabel || "Not specified"}</dd></div>
        <div><dt className="text-slate-500">Eligible devices</dt><dd className="font-bold">{campaign.eligible_count}</dd></div>
        <div><dt className="text-slate-500">Attempted deliveries</dt><dd className="font-bold">{campaign.attempted_count}</dd></div>
        <div><dt className="text-slate-500">Sent</dt><dd className="font-bold">{campaign.successful_count}</dd></div>
        <div><dt className="text-slate-500">Failed</dt><dd className="font-bold">{campaign.failed_count}</dd></div>
        <div><dt className="text-slate-500">Pending</dt><dd className="font-bold">{campaign.pending_count || 0}</dd></div>
        <div><dt className="text-slate-500">Cancelled deliveries</dt><dd className="font-bold">{campaign.cancelled_count || 0}</dd></div>
        <div><dt className="text-slate-500">Disabled</dt><dd className="font-bold">{campaign.disabled_subscription_count}</dd></div>
        <div><dt className="text-slate-500">Created</dt><dd className="font-bold">{formatTimestampInTimeZone(campaign.created_at, timeZone)}</dd></div>
        {campaign.claimed_at && <div><dt className="text-slate-500">Delivery started</dt><dd className="font-bold">{formatTimestampInTimeZone(campaign.claimed_at, timeZone)}</dd></div>}
        {campaign.sent_at && <div><dt className="text-slate-500">Completed</dt><dd className="font-bold">{formatTimestampInTimeZone(campaign.sent_at, timeZone)}</dd></div>}
        {campaign.archived_at && <div><dt className="text-slate-500">Archived</dt><dd className="font-bold">{formatTimestampInTimeZone(campaign.archived_at, timeZone)}</dd></div>}
      </dl>
      {deliverySummary && <p role="status" className="mt-5 whitespace-pre-line rounded-xl bg-slate-100 p-4 text-sm font-bold dark:bg-[#333]">{deliverySummary}</p>}
      {!campaign.archived_at && ["draft","scheduled"].includes(campaign.status) && <form action={reschedule} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-bold">Schedule in {schoolData.timezone || "America/Los_Angeles"}<input required type="datetime-local" name="scheduled_for" className="mt-2 block rounded-lg border p-2 dark:bg-black" /></label>
        <button className="rounded-lg border px-4 py-2 font-bold">Save schedule</button>
      </form>}
      {!campaign.archived_at && ["draft","scheduled","queued"].includes(campaign.status) && <form action={cancel} className="mt-6"><button className="rounded-lg border border-red-300 px-4 py-2 font-bold text-red-700">Cancel notification</button></form>}
    </section>
    <NotificationPendingRecoveryActions
      school={school}
      campaignId={campaignId}
      version={campaign.version}
      pendingCount={campaign.pending_count || 0}
      active={displayStatus === "action_required"}
    />
    <h2 className="mt-8 text-xl font-bold">Audit history</h2>
    <div className="mt-3 rounded-2xl border bg-white dark:border-[#3a3a3a] dark:bg-[#242424]">{audit?.map((row) => <div key={row.id} className="border-b p-4 last:border-0 dark:border-[#3a3a3a]"><p className="font-bold">{row.summary}</p><p className="text-xs text-slate-500">{formatTimestampInTimeZone(row.created_at, timeZone)} · {row.result_status}</p></div>)}</div>
  </main>;
}
