import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("School App PWA integration contract", () => {
  it("emits one App-specific manifest through the centralized path helper", () => {
    const appLayout = source("src/app/[school]/app/layout.tsx");

    expect(appLayout.match(/manifest:/g)).toHaveLength(1);
    expect(appLayout).toContain("getSchoolAppManifestPath");
    expect(appLayout).not.toContain("`/${school}/manifest.webmanifest`");
    expect(appLayout).toContain('"apple-mobile-web-app-capable": "yes"');
    expect(appLayout).toContain("title: appTitle");
    expect(appLayout).toContain("applicationName: getSchoolAppName");
    expect(appLayout).toContain('url: "/apple-touch-icon.png"');
    expect(appLayout).toContain("getSchoolAppCanonicalUrl");
  });

  it("keeps the public homepage manifest separate and unchanged", () => {
    const rootManifest = source("src/app/manifest.ts");
    const schoolLayout = source("src/app/[school]/layout.tsx");

    expect(rootManifest).toContain('start_url: "/"');
    expect(rootManifest).toContain('scope: "/"');
    expect(schoolLayout).not.toContain("manifest:");
  });

  it("keeps both the new endpoint and legacy manifest endpoint tenant-validated", () => {
    const appRoute = source("src/app/[school]/app/manifest/route.ts");
    const legacyRoute = source(
      "src/app/[school]/manifest.webmanifest/route.ts"
    );
    const server = source("src/lib/pwa/schoolAppManifest.server.ts");

    expect(appRoute).toContain("getSchoolAppManifestResponse");
    expect(legacyRoute).toContain("getSchoolAppManifestResponse");
    expect(server).toContain("getSchoolLifecycleBySubdomain");
    expect(server).toContain("schoolData.id !== lifecycle.id");
    expect(server).toContain("schoolData.subdomain.trim().toLowerCase()");
  });

  it("forces public School App entry points through a fresh document load", () => {
    const installLink = source(
      "src/components/pwa/SchoolAppInstallLink.tsx"
    );
    const homepage = source("src/app/[school]/page.tsx");
    const navigation = source("src/components/SchoolPublicNav.tsx");
    const footer = source("src/components/public-site/PublicSite.tsx");

    expect(installLink).toContain("return <a {...props} />");
    expect(installLink).toContain("manifest");
    expect(homepage).toContain("<SchoolAppInstallLink");
    expect(navigation).toContain("installSurface: true");
    expect(navigation).toContain("<SchoolAppInstallLink");
    expect(footer).toContain("<SchoolAppInstallLink");
  });

  it("uses network-first manifest refresh while preserving App and Kiosk navigation", () => {
    const worker = source("public/sw.js");

    expect(worker).toContain('const ASSET_CACHE = "sundial-assets-v3"');
    expect(worker).toContain('request.destination === "manifest"');
    expect(worker).toContain("networkFirstResource(request, ASSET_CACHE)");
    expect(worker).toContain('if (segments[0] === "app") return ["/app", url.pathname]');
    expect(worker).toContain('if (segments[0] === "kiosk") return ["/kiosk", url.pathname]');
    expect(worker).toContain("request.mode === \"navigate\" && isAppOrKioskPath");
    expect(worker).not.toMatch(/navigate[\s\S]{0,120}redirect/i);
  });
});
