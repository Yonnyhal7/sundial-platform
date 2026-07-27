import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");
const migration = read(
  "supabase/migrations/20260727150000_notification_pending_delivery_recovery.sql"
);
const actions = read("src/app/[school]/admin/notifications/actions.ts");
const detail = read(
  "src/app/[school]/admin/notifications/[campaignId]/page.tsx"
);
const recoveryUi = read(
  "src/components/admin/NotificationPendingRecoveryActions.tsx"
);
const list = read("src/components/admin/NotificationCampaignList.tsx");
const listPage = read("src/app/[school]/admin/notifications/page.tsx");
const dashboard = read(
  "src/components/admin/NotificationCampaignDashboard.tsx"
);
const processor = read("src/lib/notifications/service.server.ts");

describe("notification pending-delivery recovery migration", () => {
  it("durably identifies only reconciled, unclaimed quarantine campaigns", () => {
    expect(migration).toContain("delivery_resolution_required boolean not null default false");
    expect(migration).toContain("campaign.pending_count>0");
    expect(migration).toContain("campaign.status='sending'");
    expect(migration).toContain("campaign.claim_token is null");
    expect(migration).toContain("campaign.claimed_at is null");
    expect(migration).toContain("audit.action='campaign_pending_delivery_quarantined'");
  });

  it("retries only existing proven-pending rows without creating deliveries", () => {
    const retry = migration.slice(
      migration.indexOf("create or replace function public.retry_notification_campaign_pending"),
      migration.indexOf("create or replace function public.cancel_notification_campaign_pending")
    );
    expect(retry).toContain("delivery_status='pending'");
    expect(retry).toContain("delivery_status='sending'");
    expect(retry).toContain("'ambiguous_deliveries'");
    expect(retry).toContain("set status='queued'");
    expect(retry).not.toMatch(/insert into public\.notification_deliveries/i);
    expect(retry).not.toMatch(/update public\.notification_deliveries/i);
    expect(processor).toContain("campaign.delivery_recovery_requested_at");
    expect(processor).toContain("? []");
  });

  it("cancels only unresolved rows and preserves delivered history", () => {
    const cancel = migration.slice(
      migration.indexOf("create or replace function public.cancel_notification_campaign_pending"),
      migration.indexOf("create or replace function public.archive_notification_campaign")
    );
    expect(cancel).toContain("delivery_status in ('pending','sending')");
    expect(cancel).toContain("set delivery_status='cancelled'");
    expect(cancel).not.toContain("delivery_status='sent'");
    expect(cancel).not.toContain("delivery_status='failed'");
    expect(cancel).toContain("pending_count=0");
    expect(cancel).toContain("cancelled_count=v_cancelled");
    expect(cancel).not.toContain("processNotificationQueue");
  });

  it("serializes concurrent resolution with tenant, permission, and version checks", () => {
    expect(migration.match(/for update;/g)).toHaveLength(3);
    expect(migration).toContain(
      "current_user_can_manage_school_section(p_school_id,'notifications')"
    );
    expect(migration).toContain("where id=p_campaign_id and school_id=p_school_id");
    expect(migration).toContain("v_row.version<>p_expected_version");
    expect(migration).toContain("v_row.claim_token is not null");
    expect(migration).toContain("v_row.claimed_at is not null");
  });

  it("records request, cancellation, and completion audits", () => {
    expect(migration).toContain("Retry requested for %s pending deliveries.");
    expect(migration).toContain(
      "Remaining %s deliveries cancelled by administrator."
    );
    expect(processor).toContain(
      "Retry processing completed with status ${totals.status}."
    );
    expect(migration).toContain("actor_id");
  });

  it("blocks archive until pending deliveries are resolved", () => {
    expect(migration).toContain(
      "v_row.status='sending' or v_row.pending_count>0 or v_row.delivery_resolution_required"
    );
    expect(list).toContain("Resolve pending deliveries before archiving.");
    expect(list).toContain(
      'getCampaignDisplayStatus(removal.campaign) === "action_required"'
    );
  });
});

describe("notification pending-delivery recovery UI", () => {
  it("shows the truthful status and supporting detail copy", () => {
    expect(detail).toContain('displayStatus === "action_required"');
    expect(detail).toContain("<NotificationPendingRecoveryActions");
    expect(recoveryUi).toContain(
      "Some deliveries remain pending. Choose whether to retry them or cancel"
    );
    expect(recoveryUi).toContain("Retry pending deliveries");
    expect(recoveryUi).toContain("Cancel remaining deliveries");
    expect(dashboard).toContain('"action-required"');
    expect(listPage).toContain('view === "action-required"');
    expect(listPage).toContain('.eq("delivery_resolution_required", true)');
  });

  it("requires accessible confirmations with exact device counts", () => {
    expect(recoveryUi).toContain('role="dialog"');
    expect(recoveryUi).toContain('aria-modal="true"');
    expect(recoveryUi).toContain("Retry delivery to the remaining ${pendingCount} devices?");
    expect(recoveryUi).toContain("Cancel the remaining ${pendingCount} deliveries?");
    expect(recoveryUi).toContain('event.key === "Escape"');
    expect(recoveryUi).toContain('event.key !== "Tab"');
    expect(recoveryUi).toContain("focus({ preventScroll: true })");
    expect(recoveryUi).toContain('aria-live="polite"');
  });

  it("uses authorized server actions and disables repeated submissions", () => {
    expect(actions).toContain("retryNotificationCampaignPendingAction");
    expect(actions).toContain("cancelNotificationCampaignPendingAction");
    expect(actions).toContain('"retry_notification_campaign_pending"');
    expect(actions).toContain('"cancel_notification_campaign_pending"');
    expect(recoveryUi).toContain("if (!resolution || pending) return");
    expect(recoveryUi).toContain("disabled={pending}");
  });
});
