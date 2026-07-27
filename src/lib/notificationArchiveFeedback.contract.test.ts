import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");
const list = read("src/components/admin/NotificationCampaignList.tsx");
const dashboard = read("src/components/admin/NotificationCampaignDashboard.tsx");
const actions = read("src/app/[school]/admin/notifications/actions.ts");
const styles = read("src/app/globals.css");

describe("notification campaign optimistic archive feedback", () => {
  it("closes the menu and removes the campaign before awaiting the RPC", () => {
    const handler = list.slice(
      list.indexOf("async function selectArchive"),
      list.indexOf("function selectDuplicate")
    );
    expect(handler).toContain("closeMenu(false)");
    expect(handler).toContain("setVisibleCampaigns(removal.campaigns)");
    expect(handler).toContain("onActiveCountChange(-1)");
    expect(handler.indexOf("setVisibleCampaigns(removal.campaigns)"))
      .toBeLessThan(handler.indexOf("await archiveNotificationCampaignAction"));
  });

  it("blocks duplicate archive submissions without blocking the page", () => {
    expect(list).toContain("pendingArchiveIdsRef.current.has(campaignId)");
    expect(list).toContain("pendingArchiveIdsRef.current.add(campaignId)");
    expect(list).toContain("pendingArchiveIdsRef.current.delete(campaignId)");
    expect(list).not.toContain("Archiving…");
  });

  it("updates and rolls back the active campaign count", () => {
    expect(dashboard).toContain("activeCampaignCount");
    expect(dashboard).toContain("setActiveCampaignCount");
    expect(list).toContain("onActiveCountChange(-1)");
    expect(list).toContain("onActiveCountChange(1)");
  });

  it("restores the original row position and reports failure", () => {
    expect(list).toContain("restoreCampaignAtIndex(");
    expect(list).toContain("removal.index");
    expect(list).toContain("Could not archive notification. Try again.");
    expect(list).not.toContain("setOpenCampaignMenuId(campaignId)");
  });

  it("announces success and failure accessibly without motion", () => {
    expect(list).toContain("✓ Notification archived");
    expect(list).toContain('role={toast.kind === "error" ? "alert" : "status"}');
    expect(list).toContain('"assertive" : "polite"');
    expect(list).toContain("focus({ preventScroll: true })");
  });

  it("auto-dismisses one success toast after an animated bounded interval", () => {
    expect(list.match(/const \[toast, setToast\]/g)).toHaveLength(1);
    expect(list).toContain('toast.kind === "success" ? 2300 : 5800');
    expect(list).toContain("toast.exiting ? 200");
    expect(list).toContain('data-state={toast.exiting ? "exiting" : "visible"}');
    expect(list).toContain("pointer-events-none");
    expect(styles).toContain("@keyframes notification-toast-enter");
    expect(styles).toContain("@keyframes notification-toast-exit");
    expect(styles).toContain('.notification-toast[data-state="exiting"]');
  });

  it("disables toast animation when reduced motion is preferred", () => {
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(
      ".public-appearance-sheet,\n  .notification-toast { animation: none; }"
    );
  });

  it("preserves server-side tenant, permission, and version enforcement", () => {
    expect(actions).toContain("const { schoolData, admin } = await authorized(school)");
    expect(actions).toContain('rpc("archive_notification_campaign"');
    expect(actions).toContain("p_school_id: schoolData.id");
    expect(actions).toContain("p_expected_version: version");
  });
});
