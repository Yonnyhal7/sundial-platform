import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import {
  getSundialFaviconMetadata,
  getTenantFaviconMetadata,
  SUNDIAL_FAVICON_PATH,
} from "./tenantFavicon";

function renderResolvedHead(metadata: Metadata) {
  const iconEntries =
    metadata.icons && !Array.isArray(metadata.icons)
      ? typeof metadata.icons === "string" ||
        metadata.icons instanceof URL
        ? [{ url: metadata.icons }]
        : Array.isArray(metadata.icons.icon)
          ? metadata.icons.icon
          : metadata.icons.icon
            ? [metadata.icons.icon]
            : []
      : [];
  const manifest = metadata.manifest
    ? `<link rel="manifest" href="${String(metadata.manifest)}">`
    : "";
  const icons = iconEntries
    .map((entry) => {
      const icon = typeof entry === "string" || entry instanceof URL
        ? { url: entry }
        : entry;
      return `<link rel="${icon.rel || "icon"}" href="${String(icon.url)}">`;
    })
    .join("");

  return `${manifest}${icons}`;
}

describe("final favicon head output", () => {
  it("has no automatic root favicon file or global root rel=icon metadata", () => {
    expect(
      existsSync(join(process.cwd(), "src/app/favicon.ico"))
    ).toBe(false);

    const rootLayout = readFileSync(
      join(process.cwd(), "src/app/layout.tsx"),
      "utf8"
    );
    expect(rootLayout).not.toContain('url: "/favicon.ico"');
    expect(rootLayout).not.toContain('url: "/icon-192.png"');
    expect(rootLayout).not.toContain('url: "/icon-512.png"');
    expect(rootLayout).toContain('url: "/apple-touch-icon.png"');
  });

  it.each(["public", "app", "kiosk"])(
    "renders exactly one school-logo favicon for a logo-backed %s route",
    () => {
      const head = renderResolvedHead(
        getTenantFaviconMetadata(
          "deloro",
          "https://assets.example.com/deloro.png"
        )
      );

      expect(head.match(/rel="icon"/g)).toHaveLength(1);
      expect(head).toMatch(
        /href="\/api\/schools\/deloro\/tab-icon\?v=[a-f0-9]{8}"/
      );
      expect(head).not.toContain("/favicon.ico");
      expect(head).not.toContain("/sundial-icon.png");
    }
  );

  it("renders Sundial as the only favicon when a tenant has no logo", () => {
    const head = renderResolvedHead(
      getTenantFaviconMetadata("deloro", null)
    );

    expect(head.match(/rel="icon"/g)).toHaveLength(1);
    expect(head).toContain(SUNDIAL_FAVICON_PATH);
  });

  it("renders Sundial as the only admin favicon", () => {
    const head = renderResolvedHead(getSundialFaviconMetadata());

    expect(head.match(/rel="icon"/g)).toHaveLength(1);
    expect(head).toContain(SUNDIAL_FAVICON_PATH);
    expect(head).not.toContain("/api/schools/");
  });

  it("keeps the app manifest alongside, but separate from, its tenant favicon", () => {
    const tenantMetadata = getTenantFaviconMetadata(
      "deloro",
      "https://assets.example.com/deloro.png"
    );
    const head = renderResolvedHead({
      ...tenantMetadata,
      manifest: "/deloro/app/manifest",
    });

    expect(head).toContain(
      '<link rel="manifest" href="/deloro/app/manifest">'
    );
    expect(head.match(/rel="icon"/g)).toHaveLength(1);
    expect(head).not.toContain(SUNDIAL_FAVICON_PATH);
  });
});
