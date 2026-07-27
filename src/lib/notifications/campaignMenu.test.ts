import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getCampaignMenuPosition,
  getNextCampaignMenuItemIndex,
} from "./campaignMenu";

const list = readFileSync(
  "src/components/admin/NotificationCampaignList.tsx",
  "utf8"
);
const page = readFileSync(
  "src/app/[school]/admin/notifications/page.tsx",
  "utf8"
);
const dashboard = readFileSync(
  "src/components/admin/NotificationCampaignDashboard.tsx",
  "utf8"
);

describe("notification campaign menu controller", () => {
  it("owns exactly one open campaign id and toggles the same trigger closed", () => {
    expect(list).toContain(
      "openCampaignMenuId, setOpenCampaignMenuId"
    );
    expect(list).toContain(
      "current === campaignId ? null : campaignId"
    );
    expect(dashboard).toContain("<NotificationCampaignList");
    expect(page).not.toContain("<NotificationCampaignMenu");
  });

  it("closes on outside pointer, Escape, and scroll while handling resize", () => {
    expect(list).toContain('document.addEventListener("pointerdown"');
    expect(list).toContain('event.key !== "Escape"');
    expect(list).toContain('window.addEventListener("scroll", onScroll, true)');
    expect(list).toContain('window.addEventListener("resize", onResize)');
    expect(list).toContain("closeMenu(true)");
  });

  it("renders one fixed menu through document.body outside clipped panels", () => {
    expect(list).toContain("createPortal(");
    expect(list).toContain("document.body");
    expect(list).toContain('role="menu"');
    expect(list.match(/role="menu"/g)).toHaveLength(1);
    expect(list).toContain('className="fixed z-[120]');
    expect(list).toContain("overflow-hidden rounded-2xl");
  });

  it("closes before every navigation or mutation action", () => {
    expect(list).toContain('onClick={() => closeMenu(false)}');
    expect(list).toContain("function selectMutation");
    expect(list).toContain("function selectDuplicate");
    expect(list).toContain("function openDeleteConfirmation");
    for (const action of [
      "archiveNotificationCampaignAction",
      "restoreNotificationCampaignAction",
      "permanentlyDeleteNotificationCampaignAction",
      "duplicateNotificationCampaignAction",
    ]) {
      expect(list).toContain(action);
    }
  });
});

describe("notification campaign menu positioning", () => {
  it("aligns to the trigger right edge and opens downward when space permits", () => {
    expect(getCampaignMenuPosition({
      triggerLeft: 800,
      triggerRight: 844,
      triggerTop: 100,
      triggerBottom: 144,
      menuWidth: 192,
      menuHeight: 136,
      viewportWidth: 1024,
      viewportHeight: 768,
    })).toEqual({ left: 652, top: 150, opensDownward: true });
  });

  it("flips a bottom-row menu upward and keeps it inside viewport margins", () => {
    const position = getCampaignMenuPosition({
      triggerLeft: 300,
      triggerRight: 344,
      triggerTop: 700,
      triggerBottom: 744,
      menuWidth: 192,
      menuHeight: 136,
      viewportWidth: 360,
      viewportHeight: 760,
    });
    expect(position).toEqual({ left: 152, top: 558, opensDownward: false });
    expect(position.left).toBeGreaterThanOrEqual(10);
    expect(position.left + 192).toBeLessThanOrEqual(350);
    expect(position.top).toBeGreaterThanOrEqual(10);
  });
});

describe("notification campaign menu accessibility", () => {
  it("exposes menu semantics and restores trigger focus", () => {
    expect(list).toContain('aria-haspopup="menu"');
    expect(list).toContain("aria-expanded={expanded}");
    expect(list).toContain('role="menuitem"');
    expect(list).toContain("firstItem?.focus()");
    expect(list).toContain("triggerRefs.current.get(campaignId)?.focus()");
    expect(list).toContain("min-h-11");
  });

  it.each([
    ["ArrowDown", 0, 3, 1],
    ["ArrowDown", 2, 3, 0],
    ["ArrowUp", 0, 3, 2],
    ["Home", 2, 3, 0],
    ["End", 0, 3, 2],
    ["Enter", 0, 3, null],
  ])("handles %s navigation", (key, current, count, expected) => {
    expect(getNextCampaignMenuItemIndex(key, current, count)).toBe(expected);
  });

  it("activates Space explicitly while native controls retain Enter behavior", () => {
    expect(list).toContain('event.key === " "');
    expect(list).toContain("document.activeElement.click()");
  });
});
