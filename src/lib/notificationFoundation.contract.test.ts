import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260724110000_notification_foundation.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/schools/[school]/notifications/route.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("./notifications/service.server.ts", import.meta.url), "utf8");
const processorPolicy = readFileSync(new URL("./notifications/processorPolicy.ts", import.meta.url), "utf8");
const processorClaimMigration = readFileSync(new URL("../../supabase/migrations/20260725123000_notification_processor_single_claim.sql", import.meta.url), "utf8");
const pendingInvariantMigration = readFileSync(new URL("../../supabase/migrations/20260727133000_notification_pending_delivery_invariant.sql", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/mobile-app/AppHeader.tsx", import.meta.url), "utf8");
const startup = readFileSync(new URL("../components/pwa/PwaStartupBoundary.tsx", import.meta.url), "utf8");
const audienceSummary = readFileSync(new URL("../components/mobile-app/NotificationAudienceSummary.tsx", import.meta.url), "utf8");
const newAnnouncement = readFileSync(new URL("../app/[school]/admin/announcements/new/page.tsx", import.meta.url), "utf8");
const editAnnouncement = readFileSync(new URL("../app/[school]/admin/announcements/[announcementId]/edit/page.tsx", import.meta.url), "utf8");
const notificationActions = readFileSync(new URL("../app/[school]/admin/notifications/actions.ts", import.meta.url), "utf8");
const cron = readFileSync(new URL("../app/api/cron/notifications/route.ts", import.meta.url), "utf8");

describe("notification foundation security", () => {
  it("owns every notification record by school and rejects cross-school child links", () => {
    for (const table of ["notification_campaigns","notification_campaign_audiences","notification_devices","push_subscriptions","notification_device_preferences","notification_deliveries","notification_audit"]) {
      expect(migration).toMatch(new RegExp(`create table public\\.${table} \\([\\s\\S]*?school_id uuid not null`));
    }
    expect(migration).toContain("foreign key(campaign_id,school_id)");
    expect(migration).toContain("foreign key(device_id,school_id)");
    expect(migration).toMatch(/foreign key\(campaign_id,school_id\)\r?\n    references public\.notification_campaigns\(id,school_id\)/);
    expect(migration).toContain("enforce_notification_campaign_tenant_relationships");
    expect(migration).toContain("enforce_notification_device_tenant_relationships");
    expect(migration).toContain("notification_user_can_access_school(new.user_id,new.school_id)");
    expect(migration).toContain("Notification destination must remain within its school");
    expect(migration).toContain("Notification campaign actor does not belong to its school");
  });
  it("uses RLS and withholds device/subscription secrets from application roles", () => {
    expect(migration).toContain("alter table public.push_subscriptions enable row level security");
    expect(migration).toContain("revoke all on public.notification_school_settings");
    expect(migration).not.toMatch(/grant select on[^;]*push_subscriptions[^;]*authenticated/i);
    expect(migration).not.toMatch(/create policy[^;]*push_subscriptions/i);
    expect(api).toContain('createHash("sha256")');
    expect(api).toContain("timingSafeEqual");
    expect(api).toContain("token.length < 32");
    expect(api).not.toContain("console.");
    expect(migration).toContain("push_subscriptions_one_active_device_idx");
    expect(migration).toContain("revoke all on function public.initialize_notification_school_settings()");
    expect(api).toContain('.is("disabled_at", null).neq("endpoint", endpoint)');
    expect(api).toContain("auth.getUser()");
    expect(api).toContain('.from("school_memberships")');
  });
  it("authorizes campaigns server-side and claims due work atomically", () => {
    expect(migration).toContain("current_user_can_manage_school_section(p_school_id,'notifications')");
    expect(migration).toContain("archived_at is null");
    expect(migration).toContain("unique(school_id,idempotency_key)");
    expect(migration).toContain("p_origin_timezone is distinct from v_school.timezone");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("'duplicate','campaign_id',v_id");
    expect(migration).toContain("school.archived_at is null");
    expect(migration).toContain("for update of c skip locked");
  });
  it("does not resend terminal deliveries and preserves aggregate retry results", () => {
    expect(service).toContain("isProvenUnattempted");
    expect(service).toContain("const pendingEligible = eligible.filter");
    expect(service).toContain(
      "const missingDeliveries = campaign.delivery_recovery_requested_at"
    );
    expect(service).toContain("findMissingDeliveryDevices(");
    expect(service).toContain("read_prior_deliveries");
    expect(service).toContain("if (missingDeliveries.length)");
    expect(processorPolicy).toContain('return status === "pending"');
    expect(processorPolicy).toContain('status === "sent"');
    expect(processorPolicy).toContain('status === "inbox_only"');
    expect(processorPolicy).toContain('status === "disabled_subscription"');
    expect(service).toContain("statusCode === 404 || statusCode === 410");
    expect(service).toContain('reason.disable ? "disabled_subscription" : "failed"');
    expect(service).toContain("summarizeCampaignDeliveries");
    expect(service).toContain("duplicate_protection");
    expect(service).toContain("checkedRows");
    expect(service).not.toMatch(/const \{\s*data(?::|,|\s*\})/);
    expect(service).toContain("finally {");
    expect(service).toContain("insert_campaign_finalization_audit");
    expect(processorClaimMigration).toContain("limit 1");
    expect(processorClaimMigration).toContain("c.claimed_at<now()-interval '10 minutes'");
  });
  it("keeps device inbox state exact and tenant-scoped", () => {
    expect(api).toContain('{ count: "exact", head: true }');
    expect(api).toContain("unreadCount: unreadCount || 0");
    expect(api).toContain("audience: ctx.device.audience");
    expect(api).toContain('.eq("school_id", ctx.school.id).eq("device_id", ctx.device.id)');
    expect(api).toContain('deliveryId === "all"');
    expect(header).toContain("reportedUnreadCount");
    expect(header).toContain("setReportedUnreadCount(0)");
    expect(header).toContain(
      "bg-[var(--school-accent-visible-primary)]"
    );
  });
  it("reads a device audience from its verified tenant registration and keeps it read-only", () => {
    const getHandler = api.slice(
      api.indexOf("export async function GET"),
      api.indexOf("export async function POST")
    );
    const existingDeviceUpdate = api.slice(
      api.indexOf('ctx.db.from("notification_devices").update({'),
      api.indexOf('}).eq("id", ctx.device.id)', api.indexOf('ctx.db.from("notification_devices").update({'))
    );

    expect(api).toContain('.eq("school_id", school.id).eq("installation_id", installationId)');
    expect(api).toContain("timingSafeEqual(actual, expected)");
    expect(getHandler).not.toContain("authenticatedProfileForSchool");
    expect(getHandler).not.toContain("Notification.permission");
    expect(api).toContain("ctx.device.audience !== audience");
    expect(api).toContain('error: "Device audience is already configured"');
    expect(existingDeviceUpdate).not.toContain("audience");
    expect(header).toContain('const persistedAudience = String(payload?.audience || "")');
    expect(header).toContain("isNotificationAudience(persistedAudience)");
    expect(startup).toContain('status: "assigned"');
    expect(startup).toContain("isNotificationAudience(audience)");
    expect(startup).toContain('status: "unassigned"');
    expect(header).not.toContain("NotificationAudienceOnboarding");
    expect(header).not.toContain("SchoolAdmin");
    expect(header).not.toContain("Editor");
    expect(audienceSummary).toContain("Notifications, ${label} device");
    expect(audienceSummary).not.toContain("<select");
    expect(audienceSummary).not.toContain("<button");
    expect(audienceSummary).not.toContain("permission");
  });
  it("keeps announcement delivery modes and cron authorization explicit", () => {
    expect(newAnnouncement).toContain('value="publish_only"');
    expect(newAnnouncement).toContain('value="publish_and_push"');
    expect(newAnnouncement).toContain('value="push_only"');
    expect(newAnnouncement).toContain("queueAnnouncementNotification");
    expect(editAnnouncement).toContain("queueAnnouncementNotification");
    expect(cron).toContain("requireCronAuthorization");
    expect(cron).toContain("Notification processing unavailable");
  });
  it("leaves queued campaign processing to the durable cron invocation", () => {
    expect(notificationActions).not.toContain("processNotificationQueue");
    expect(notificationActions).not.toContain('from "next/server"');
    expect(cron).toContain("await processNotificationQueue()");
  });
  it("records nonterminal processing as deferred instead of completed", () => {
    expect(service).toContain('"campaign_delivery_deferred"');
    expect(service).toContain("cron recovery required.");
    expect(service).toContain('? "blocked"');
    expect(service).toContain('sent_at: deferred ? null : completedAt');
    expect(service).toContain("pending_count: totals.pendingOrAmbiguous");
  });
  it("quarantines legacy pending deliveries without automatically retrying them", () => {
    expect(pendingInvariantMigration).toContain(
      "delivery_status in ('pending','sending')"
    );
    expect(pendingInvariantMigration).toContain("claimed_at=null");
    expect(pendingInvariantMigration).toContain("claim_token=null");
    expect(pendingInvariantMigration).toContain("'automatic_retry',false");
    expect(pendingInvariantMigration).toContain(
      "notification_campaigns_terminal_pending_check"
    );
    expect(pendingInvariantMigration).not.toContain(
      "update public.notification_deliveries"
    );
  });
  it("extends the existing worker with tenant-safe push routing", () => {
    expect(worker).toContain('addEventListener("push"');
    expect(worker).toContain('addEventListener("notificationclick"');
    expect(worker).toContain("requestedPath.startsWith(`/${schoolSlug}/`)");
    expect(worker).toContain("PURGE_SCHOOL_CACHE");
    expect(worker).toContain("self.skipWaiting()");
    expect(worker).toContain("self.clients.claim()");
  });
});
