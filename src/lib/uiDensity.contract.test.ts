import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("desktop UI density", () => {
  const styles = source("src/app/globals.css");

  it("scopes admin density to desktop shells without scaling the application", () => {
    expect(source("src/app/[school]/admin/layout.tsx")).toContain(
      "admin-theme admin-density"
    );
    expect(source("src/app/admin/dashboard/layout.tsx")).toContain(
      "admin-theme admin-density"
    );
    expect(styles).toContain("@media (min-width: 64rem)");
    expect(styles).not.toMatch(
      /\.admin-density[^\{]*\{[^}]*[\s\S]\b(?:zoom|transform\s*:\s*scale)/
    );
  });

  it("keeps mobile and kiosk outside the density scope", () => {
    expect(source("src/app/[school]/kiosk/KioskDisplay.tsx")).not.toContain(
      "admin-density"
    );
    expect(source("src/components/mobile-app/AppHeader.tsx")).not.toContain(
      "admin-density"
    );
  });

  it("uses shared public and marketing density boundaries", () => {
    expect(source("src/components/public-site/publicDensity.ts")).toContain(
      'pageSection: "py-8 sm:py-10"'
    );
    expect(source("src/app/page.tsx")).toContain("marketing-density");
  });

  it("defines a desktop admin typography hierarchy without changing mobile text", () => {
    expect(styles).toContain(".admin-density [class~=\"text-xs\"]");
    expect(styles).toContain("font-size: 0.8125rem");
    expect(styles).toContain('.admin-density [class~="text-sm"]');
    expect(styles).toContain("font-size: 0.9375rem");
    expect(styles).toContain('.admin-density [class~="text-xl"]');
    expect(styles).toContain("font-size: 1.1875rem");
    expect(styles).toContain('.admin-density [class~="text-3xl"]');
    expect(styles).toContain("font-size: 1.75rem");
    expect(styles).toContain(".admin-density .admin-sidebar");
    expect(styles).toContain("font-size: 0.875rem");
  });
});
