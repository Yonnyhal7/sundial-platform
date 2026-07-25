import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getKioskTitle,
  getSundialAdminMetadata,
  getTenantTitle,
} from "@/lib/tabTitles";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("tenant tab title metadata", () => {
  it("uses the school name as the tenant default and template suffix", () => {
    expect(getTenantTitle("David's School")).toEqual({
      default: "David's School",
      template: "%s | David's School",
    });
  });

  it("falls back safely when the school name is empty", () => {
    expect(getTenantTitle("  ")).toEqual({
      default: "Sundial",
      template: "%s | Sundial",
    });
  });

  it("keeps all admin boundaries Sundial-first", () => {
    expect(getSundialAdminMetadata().title).toEqual({
      default: "Sundial",
      template: "Sundial | %s",
    });
    expect(source("src/app/[school]/admin/page.tsx")).toContain(
      'title: "Dashboard"'
    );
  });

  it.each([
    ["src/app/[school]/schedule/page.tsx", "Calendar"],
    ["src/app/[school]/events/page.tsx", "Events"],
    ["src/app/[school]/app/schedule/page.tsx", "Calendar"],
    ["src/app/[school]/app/notifications/page.tsx", "Notifications"],
  ])("%s supplies the expected leaf title", (path, title) => {
    expect(source(path)).toContain(`title: "${title}"`);
  });

  it("keeps the app manifest and installed app title independent", () => {
    const appLayout = source("src/app/[school]/app/layout.tsx");

    expect(appLayout).toContain("manifest: manifestPath");
    expect(appLayout).toContain("title: appTitle");
    expect(appLayout).not.toContain("title: getTenantTitle");
  });

  it("uses an absolute school-name kiosk title", () => {
    expect(getKioskTitle("David's School")).toEqual({
      absolute: "David's School Kiosk",
    });
    expect(getKioskTitle(null)).toEqual({ absolute: "Sundial Kiosk" });
    expect(source("src/app/[school]/kiosk/page.tsx")).toContain(
      "getKioskTitle(schoolData?.name)"
    );
  });
});
