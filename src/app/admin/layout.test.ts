import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { metadata } from "./layout";
import { SUNDIAL_FAVICON_PATH } from "@/lib/tenantFavicon";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin metadata", () => {
  it("uses the cache-versioned Sundial icon for every admin route", () => {
    expect(metadata).toEqual({
      icons: {
        icon: [
          {
            url: SUNDIAL_FAVICON_PATH,
            type: "image/png",
          },
        ],
      },
    });
  });

  it("does not override titles, the manifest, or Home Screen icons", () => {
    expect(metadata).not.toHaveProperty("title");
    expect(metadata).not.toHaveProperty("manifest");
    expect(metadata.icons).not.toHaveProperty("apple");
  });

  it.each([
    "src/app/[school]/admin/layout.tsx",
    "src/app/[school]/login/page.tsx",
    "src/app/[school]/forgot-password/page.tsx",
  ])("forces school admin boundary %s to the Sundial favicon", (path) => {
    expect(source(path)).toContain("getSundialFaviconMetadata()");
  });

  it("keeps SuperAdmin login, dashboard, schools, and invitations under one metadata boundary", () => {
    const adminLayout = source("src/app/admin/layout.tsx");

    expect(adminLayout).toContain("getSundialFaviconMetadata()");
    expect(SUNDIAL_FAVICON_PATH).toContain("/sundial-icon.png");
    expect(source("src/app/admin/page.tsx")).not.toContain("metadata");
    expect(source("src/app/admin/dashboard/layout.tsx")).not.toContain(
      "metadata"
    );
    expect(source("src/app/admin/invitations/page.tsx")).not.toContain(
      "metadata"
    );
  });

  it("keeps public, app, and kiosk routes tenant-aware without changing manifest metadata", () => {
    const schoolLayout = source("src/app/[school]/layout.tsx");
    const appLayout = source("src/app/[school]/app/layout.tsx");
    const kioskPage = source("src/app/[school]/kiosk/page.tsx");

    expect(schoolLayout).toContain("getTenantFaviconMetadata");
    expect(appLayout).toContain("getTenantFaviconIconEntries");
    expect(appLayout).toContain("manifest: manifestPath");
    expect(kioskPage).not.toContain("generateMetadata");
  });
});
