import Link from "next/link";
import { notFound } from "next/navigation";
import { getSchoolAdminPath, requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { getSchoolForSetup } from "@/lib/schools";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import NotificationCampaignDashboard from "@/components/admin/NotificationCampaignDashboard";
import PeriodReminderStatusCard from "@/components/admin/PeriodReminderStatusCard";
import { formatPeriodReminderNextLabel } from "@/lib/notifications/periodReminders";
import { getPeriodReminderAdminStatus } from "@/lib/notifications/periodReminderStatus.server";

export default async function NotificationsPage({ params, searchParams }: { params: Promise<{ school: string }>; searchParams: Promise<{ view?: string }> }) {
  const { school } = await params;
  const schoolData = await getSchoolForSetup(school);
  if (!schoolData) notFound();
  const { supabase } = await requireAdminSectionAccess(schoolData.id, "notifications", school);
  const requestedView = (await searchParams).view || "overview";
  const view = ["overview","action-required","scheduled","sent","drafts","archived"].includes(requestedView)
    ? requestedView
    : "overview";
  const statusMap: Record<string,string[]> = { scheduled: ["scheduled","queued","sending"], sent: ["sent","partially_failed","failed","no_eligible_devices","partially_sent","cancelled"], drafts: ["draft"] };
  let query = supabase.from("notification_campaigns").select("id,title,body,category,status,scheduled_for,sent_at,created_at,eligible_count,successful_count,failed_count,pending_count,cancelled_count,claim_token,claimed_at,delivery_resolution_required,archived_at,version").eq("school_id", schoolData.id).order("created_at", { ascending: false }).limit(100);
  query = view === "archived"
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);
  if (statusMap[view]) query = query.in("status", statusMap[view]);
  if (view === "scheduled") query = query.eq("delivery_resolution_required", false);
  if (view === "action-required") {
    query = query.eq("delivery_resolution_required", true)
      .gt("pending_count", 0)
      .is("claim_token", null)
      .is("claimed_at", null);
  }
  const timeZone = schoolData.timezone || "America/Los_Angeles";
  const [{ data: campaigns }, { count: recentCampaigns }, periodReminderStatus] = await Promise.all([
    query,
    supabase.from("notification_campaigns").select("id", { count: "exact", head: true })
      .eq("school_id", schoolData.id).is("archived_at", null),
    getPeriodReminderAdminStatus({
      supabase,
      schoolId: schoolData.id,
      schoolSlug: school,
      timeZone,
    }),
  ]);
  const db = createSupabaseServiceRoleClient();
  const [{ count: devices }, { count: subscriptions }] = await Promise.all([
    db.from("notification_devices").select("id", { count: "exact", head: true }).eq("school_id", schoolData.id).is("revoked_at", null),
    db.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("school_id", schoolData.id).is("disabled_at", null),
  ]);
  const base = `${await getSchoolAdminPath(school)}/notifications`;
  if (!periodReminderStatus) notFound();
  return <main className="mx-auto max-w-6xl px-6 py-8 text-slate-950 dark:text-white">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-slate-500">{schoolData.name} Admin</p><h1 className="text-3xl font-bold">Notifications</h1></div><div className="flex gap-2"><Link href={`${base}/settings`} className="rounded-lg border px-4 py-2 font-bold">Settings</Link><Link href={`${base}/new`} className="rounded-lg bg-[var(--school-primary)] px-4 py-2 font-bold text-[var(--school-primary-text)]">Create notification</Link></div></header>
    <NotificationCampaignDashboard
      key={`${view}:${(campaigns || []).map((campaign) => `${campaign.id}:${campaign.version}`).join(",")}`}
      campaigns={campaigns || []}
      school={school}
      base={base}
      timeZone={timeZone}
      view={view}
      devices={devices || 0}
      subscriptions={subscriptions || 0}
      recentCampaigns={recentCampaigns || 0}
      periodReminderCard={
        <PeriodReminderStatusCard
          settings={periodReminderStatus.settings}
          nextReminderLabel={periodReminderStatus.next
            ? formatPeriodReminderNextLabel(
                periodReminderStatus.next,
                periodReminderStatus.now,
                timeZone,
              )
            : null}
          settingsHref={`${base}/settings`}
        />
      }
    />
  </main>;
}
