import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(
  new URL("./AdminSidebar.tsx", import.meta.url),
  "utf8"
);

describe("AdminSidebar school experience shortcuts", () => {
  it("uses centralized routing helpers for tenant-scoped App and Kiosk links", () => {
    expect(sidebarSource).toContain("getSchoolAppUrl");
    expect(sidebarSource).toContain("getSchoolKioskUrl");
    expect(sidebarSource).toContain("requestHostname");
  });

  it("places View App and View Kiosk in a separate school experience group", () => {
    expect(sidebarSource).toContain('label: "View App"');
    expect(sidebarSource).toContain('label: "View Kiosk"');
    expect(sidebarSource).toContain("School experience");
    expect(sidebarSource).toContain("border-t border-white/10");
  });

  it("opens shortcuts in a new tab with accessible labels", () => {
    expect(sidebarSource).toContain('target="_blank"');
    expect(sidebarSource).toContain('rel="noopener noreferrer"');
    expect(sidebarSource).toContain("Opens in a new tab.");
    expect(sidebarSource).toContain("ExternalLinkIcon");
  });

  it("renders the shortcut group in both mobile and desktop sidebar navigation", () => {
    expect(sidebarSource).toContain("renderMainNav(true)");
    expect(sidebarSource).toContain("renderMainNav()");
    expect(sidebarSource).toContain("overflow-x-auto");
    expect(sidebarSource).toContain("overflow-y-auto");
  });
});
