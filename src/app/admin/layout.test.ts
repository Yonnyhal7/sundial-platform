import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { metadata } from "./layout";
import { SUNDIAL_FAVICON_PATH } from "@/lib/tenantFavicon";
import { getSundialAdminMetadata } from "@/lib/tabTitles";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin metadata", () => {
  it("uses the cache-versioned Sundial icon for every admin route", () => {
    expect(metadata).toEqual(getSundialAdminMetadata());
  });

  it("sets the admin title order without changing the manifest or Home Screen icons", () => {
    expect(metadata.title).toEqual({
      default: "Sundial",
      template: "Sundial | %s",
    });
    expect(metadata).not.toHaveProperty("manifest");
    expect(metadata.icons).not.toHaveProperty("apple");
  });

  it.each([
    "src/app/[school]/admin/layout.tsx",
    "src/app/[school]/login/page.tsx",
    "src/app/[school]/forgot-password/page.tsx",
  ])("forces school admin boundary %s to the Sundial favicon", (path) => {
    expect(source(path)).toContain("getSundialAdminMetadata()");
  });

  it("keeps SuperAdmin login, dashboard, schools, and invitations under one metadata boundary", () => {
    const adminLayout = source("src/app/admin/layout.tsx");

    expect(adminLayout).toContain("getSundialAdminMetadata()");
    expect(SUNDIAL_FAVICON_PATH).toContain("/sundial-icon.png");
    expect(source("src/app/admin/page.tsx")).not.toContain("metadata");
    expect(source("src/app/admin/dashboard/page.tsx")).toContain(
      'title: "Dashboard"'
    );
    expect(source("src/app/admin/dashboard/schools/page.tsx")).toContain(
      'title: "Schools"'
    );
    expect(source("src/app/admin/invitations/page.tsx")).toContain(
      'title: "Invitations"'
    );
  });

  it("keeps public, app, and kiosk routes tenant-aware without changing manifest metadata", () => {
    const schoolLayout = source("src/app/[school]/layout.tsx");
    const appLayout = source("src/app/[school]/app/layout.tsx");
    const kioskPage = source("src/app/[school]/kiosk/page.tsx");

    expect(schoolLayout).toContain("getTenantFaviconMetadata");
    expect(schoolLayout).toContain("getTenantTitle");
    expect(schoolLayout).toContain("getSundialAdminMetadata");
    expect(appLayout).toContain("getTenantFaviconIconEntries");
    expect(appLayout).toContain("manifest: manifestPath");
    expect(kioskPage).toContain("generateMetadata");
    expect(kioskPage).toContain("Kiosk");
  });
});
