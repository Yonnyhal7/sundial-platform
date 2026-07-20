import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileAppSchool } from "@/lib/mobileAppData";
import {
  buildSchoolAppManifest,
  getSchoolAppIconUrl,
  getSchoolAppShortName,
} from "./schoolAppManifest";

const {
  getMobileAppSchool,
  getSchoolLifecycleBySubdomain,
  isSchoolFeatureAvailable,
} = vi.hoisted(() => ({
  getMobileAppSchool: vi.fn(),
  getSchoolLifecycleBySubdomain: vi.fn(),
  isSchoolFeatureAvailable: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mobileAppData", () => ({ getMobileAppSchool }));
vi.mock("@/lib/schools", () => ({ getSchoolLifecycleBySubdomain }));
vi.mock("@/lib/schoolFeatures.server", () => ({ isSchoolFeatureAvailable }));

import { getSchoolAppManifestResponse } from "./schoolAppManifest.server";

const delOro: MobileAppSchool = {
  id: "school-deloro",
  name: "Del Oro High School",
  subdomain: "deloro",
  primary_color: "#123abc",
  secondary_color: "#fedcba",
  logo_url: "https://assets.example.com/deloro.png",
  default_appearance: "dark",
  timezone: "America/Los_Angeles",
};

describe("school App manifest", () => {
  beforeEach(() => {
    getMobileAppSchool.mockReset();
    getSchoolLifecycleBySubdomain.mockReset();
    isSchoolFeatureAvailable.mockReset();
    getSchoolLifecycleBySubdomain.mockResolvedValue({
      id: delOro.id,
      subdomain: delOro.subdomain,
      archived_at: null,
    });
    isSchoolFeatureAvailable.mockResolvedValue(true);
    getMobileAppSchool.mockResolvedValue(delOro);
  });

  it("uses the tenant-host App identity without leaking the internal school path", () => {
    const manifest = buildSchoolAppManifest(delOro, "/app");

    expect(manifest).toMatchObject({
      id: "/app",
      start_url: "/app",
      scope: "/app",
      display: "standalone",
      orientation: "portrait",
      name: "Del Oro High School App",
      theme_color: "#123ABC",
      background_color: "#050505",
    });
    expect(JSON.stringify(manifest)).not.toContain("/deloro/app");
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual([
      "/app",
      "/app/schedule",
      "/app/events",
      "/app/athletics",
    ]);
  });

  it("keeps path-based identity for localhost and preview hosts", () => {
    const manifest = buildSchoolAppManifest(delOro, "/deloro/app");

    expect(manifest.id).toBe("/deloro/app");
    expect(manifest.start_url).toBe("/deloro/app");
    expect(manifest.scope).toBe("/deloro/app");
    expect(manifest.shortcuts?.[1]?.url).toBe("/deloro/app/schedule");
  });

  it("uses a safe configured school icon and preserves generic fallbacks", () => {
    const manifest = buildSchoolAppManifest(delOro, "/app");

    expect(manifest.icons?.[0]?.src).toBe(delOro.logo_url);
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icon-192.png" }),
        expect.objectContaining({ src: "/icon-512.png", purpose: "maskable" }),
        expect.objectContaining({ src: "/apple-touch-icon.png" }),
      ])
    );
    expect(getSchoolAppIconUrl("javascript:alert(1)")).toBeNull();
    expect(getSchoolAppIconUrl("//other.example/icon.png")).toBeNull();
  });

  it("keeps the short name concise and falls back from invalid colors", () => {
    const manifest = buildSchoolAppManifest(
      {
        ...delOro,
        name: "A Very Long Tenant School Name That Will Not Fit",
        primary_color: "not-a-color",
        default_appearance: "light",
      },
      "/app"
    );

    expect(
      getSchoolAppShortName("A Very Long Tenant School Name That Will Not Fit")
        .length
    ).toBeLessThanOrEqual(20);
    expect(manifest.theme_color).toBe("#2563EB");
    expect(manifest.background_color).toBe("#F8FAFC");
  });

  it("serves production tenant manifests with host-visible App paths", async () => {
    const response = await getSchoolAppManifestResponse(
      new Request("https://deloro.sundialk12.com/deloro/app/manifest", {
        headers: {
          host: "deloro.sundialk12.com",
          "x-sundial-pathname": "/app/manifest",
        },
      }),
      "deloro"
    );
    const manifest = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/manifest+json"
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate"
    );
    expect(manifest).toMatchObject({
      id: "/app",
      start_url: "/app",
      scope: "/app",
    });
  });

  it("serves localhost and preview manifests with school-first paths", async () => {
    const localhostResponse = await getSchoolAppManifestResponse(
      new Request("http://localhost:3000/deloro/app/manifest", {
        headers: { host: "localhost:3000" },
      }),
      "deloro"
    );
    const previewResponse = await getSchoolAppManifestResponse(
      new Request("https://sundial-preview.vercel.app/deloro/app/manifest", {
        headers: { host: "sundial-preview.vercel.app" },
      }),
      "deloro"
    );

    expect(await localhostResponse.json()).toMatchObject({
      id: "/deloro/app",
      start_url: "/deloro/app",
      scope: "/deloro/app",
    });
    expect(await previewResponse.json()).toMatchObject({
      id: "/deloro/app",
      start_url: "/deloro/app",
      scope: "/deloro/app",
    });
  });

  it("does not reveal another tenant through a mismatched lookup result", async () => {
    getMobileAppSchool.mockResolvedValue({
      ...delOro,
      id: "school-liberty",
      name: "Liberty High School",
      subdomain: "liberty",
    });

    const response = await getSchoolAppManifestResponse(
      new Request("https://deloro.sundialk12.com/app/manifest", {
        headers: { host: "deloro.sundialk12.com" },
      }),
      "deloro"
    );

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Liberty");
  });

  it("preserves unknown, archived, and disabled school behavior", async () => {
    getSchoolLifecycleBySubdomain.mockResolvedValueOnce(null);
    const unknown = await getSchoolAppManifestResponse(
      new Request("https://unknown.sundialk12.com/app/manifest"),
      "unknown"
    );

    getSchoolLifecycleBySubdomain.mockResolvedValueOnce({
      id: delOro.id,
      subdomain: delOro.subdomain,
      archived_at: "2026-07-20T12:00:00.000Z",
    });
    const archived = await getSchoolAppManifestResponse(
      new Request("https://deloro.sundialk12.com/app/manifest"),
      "deloro"
    );

    isSchoolFeatureAvailable.mockResolvedValueOnce(false);
    const disabled = await getSchoolAppManifestResponse(
      new Request("https://deloro.sundialk12.com/app/manifest"),
      "deloro"
    );

    expect(unknown.status).toBe(404);
    expect(archived.status).toBe(410);
    expect(archived.headers.get("cache-control")).toBe("no-store");
    expect(disabled.status).toBe(404);
  });
});
