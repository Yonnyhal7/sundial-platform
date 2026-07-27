import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260727120000_notification_campaign_archive.sql"
);
const listPage = read("src/app/[school]/admin/notifications/page.tsx");
const dashboard = read(
  "src/components/admin/NotificationCampaignDashboard.tsx"
);
const campaignList = read("src/components/admin/NotificationCampaignList.tsx");
const detailPage = read(
  "src/app/[school]/admin/notifications/[campaignId]/page.tsx"
);
const actions = read("src/app/[school]/admin/notifications/actions.ts");
const menu = read("src/components/admin/NotificationCampaignList.tsx");
const inboxApi = read("src/app/api/schools/[school]/notifications/route.ts");
const processor = read("src/lib/notifications/service.server.ts");

describe("notification campaign archive lifecycle", () => {
  it("separates archived campaigns from active list views", () => {
    expect(dashboard).toContain('"overview", "scheduled", "sent", "drafts", "archived"');
    expect(listPage).toContain('view === "archived"');
    expect(listPage).toContain('.not("archived_at", "is", null)');
    expect(listPage).toContain('.is("archived_at", null)');
    expect(campaignList).toContain("getCampaignDeliverySummary(campaign)");
  });

  it("provides the required card and archived actions", () => {
    for (const label of [
      "View Details",
      "Duplicate",
      "Archive",
      "Restore",
      "Permanently Delete",
    ]) {
      expect(menu).toContain(label);
    }
    expect(menu).toContain("Delete notification campaign permanently?");
    expect(menu).toContain("This removes the campaign from the admin history.");
    expect(menu).toContain(
      "Notifications already delivered to users will remain on their devices."
    );
    expect(menu).toContain("Delete Permanently");
    expect(menu).toContain("Cancel");
    expect(menu).toContain('aria-modal="true"');
  });

  it("retains archived details, statistics, and campaign audit history", () => {
    expect(detailPage).toContain('select("*")');
    expect(detailPage).toContain("Eligible devices");
    expect(detailPage).toContain("Attempted deliveries");
    expect(detailPage).toContain("Audit history");
    expect(detailPage).toContain("campaign.archived_at");
  });

  it("authorizes every mutation inside tenant-scoped database RPCs", () => {
    for (const rpc of [
      "archive_notification_campaign",
      "restore_notification_campaign",
      "permanently_delete_notification_campaign",
    ]) {
      expect(actions).toContain(`"${rpc}"`);
      expect(migration).toContain(
        `public.current_user_can_manage_school_section(p_school_id,'notifications')`
      );
    }
    expect(migration).toContain("where id=p_campaign_id and school_id=p_school_id");
    expect(migration).toContain("enforce_notification_delivery_campaign_tenant");
    expect(migration).toContain("enforce_notification_audit_campaign_tenant");
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("to authenticated");
  });

  it("keeps duplicate using the existing creation contract", () => {
    expect(actions).toContain("duplicateNotificationCampaignAction");
    expect(actions).toContain('rpc("create_notification_campaign"');
    expect(actions).toContain('p_status: "draft"');
    expect(actions).toContain(".eq(\"id\", campaignId).eq(\"school_id\", schoolData.id)");
  });

  it("preserves delivered inbox records and push history after hard deletion", () => {
    expect(migration).toContain("campaign_title");
    expect(migration).toContain("campaign_body");
    expect(migration).toContain("on delete set null");
    expect(migration).not.toMatch(/delete from public\.notification_deliveries/i);
    expect(migration).not.toMatch(/delete from public\.notification_audit/i);
    expect(migration).toContain("delete from public.notification_campaigns");
    expect(processor).toContain("campaign_title: campaign.title");
    expect(inboxApi).toContain("DEVICE_INBOX_SELECT");
    expect(inboxApi).not.toContain("notification_campaigns!inner");
  });

  it("keeps archived work out of the delivery claim queue", () => {
    expect(migration).toContain("where campaign.archived_at is null");
    expect(migration).toContain("if v_row.status='sending'");
  });
});
