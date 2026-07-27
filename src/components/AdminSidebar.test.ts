import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(
  new URL("./AdminSidebar.tsx", import.meta.url),
  "utf8"
);

describe("AdminSidebar school experience shortcuts", () => {
  it("uses centralized routing helpers for tenant-scoped experience links", () => {
    expect(sidebarSource).toContain("getSchoolAppUrl");
    expect(sidebarSource).toContain("getSchoolKioskUrl");
    expect(sidebarSource).toContain("getSchoolWebsiteUrl");
    expect(sidebarSource).toContain("requestHostname");
  });

  it("places View Website directly under View Kiosk in the school experience group", () => {
    const viewAppIndex = sidebarSource.indexOf('label: "View App"');
    const viewKioskIndex = sidebarSource.indexOf('label: "View Kiosk"');
    const viewWebsiteIndex = sidebarSource.indexOf('label: "View Website"');

    expect(viewAppIndex).toBeGreaterThan(-1);
    expect(viewKioskIndex).toBeGreaterThan(viewAppIndex);
    expect(viewWebsiteIndex).toBeGreaterThan(viewKioskIndex);
    expect(sidebarSource).toContain("School experience");
    expect(sidebarSource).toContain("border-t border-white/10");
  });

  it("renders Notifications with the shared clock icon", () => {
    expect(sidebarSource).toContain(
      "const NotificationsIcon = ADMIN_TAB_ICONS.notifications"
    );

    const iconSource = readFileSync(
      new URL("./admin/AdminNavIcons.tsx", import.meta.url),
      "utf8"
    );
    expect(iconSource).toContain("notifications: ClockIcon");
  });

  it("opens shortcuts in a new tab with accessible labels", () => {
    expect(sidebarSource).toContain('target="_blank"');
    expect(sidebarSource).toContain('rel="noopener noreferrer"');
    expect(sidebarSource).toContain("Opens in a new tab.");
    expect(sidebarSource).toContain("ExternalLinkIcon");
  });

  it("derives the website URL from the active school without a hardcoded tenant", () => {
    expect(sidebarSource).toContain(
      "getSchoolWebsiteUrl(school, pathname, requestHostname)"
    );
    expect(sidebarSource.toLowerCase()).not.toContain("davids school");
    expect(sidebarSource).not.toContain("davids.");
  });

  it("renders the shortcut group in both mobile and desktop sidebar navigation", () => {
    expect(sidebarSource).toContain("renderMainNav(true)");
    expect(sidebarSource).toContain("renderMainNav()");
    expect(sidebarSource).toContain("overflow-x-auto");
    expect(sidebarSource).toContain("overflow-y-auto");
  });
});
