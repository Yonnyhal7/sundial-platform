import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const controlsSource = fs.readFileSync(
  path.join(root, "src/components/KioskMenuControls.tsx"),
  "utf8"
);
const kioskSource = [
  "src/app/[school]/kiosk/KioskDisplay.tsx",
  "src/components/KioskMenuControls.tsx",
  "src/components/offline/OfflineKioskRuntime.tsx",
]
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");
const globalStyles = fs.readFileSync(
  path.join(root, "src/app/globals.css"),
  "utf8"
);
const kioskStyles = globalStyles.slice(
  globalStyles.indexOf(".kiosk-theme {"),
  globalStyles.indexOf(".mobile-app-theme {")
);
const kioskColorSource = `${kioskSource}\n${kioskStyles}`;

describe("kiosk utility controls", () => {
  it("puts Back to Website before Full Screen in the utility bar", () => {
    expect(controlsSource.indexOf("<span>Back to Website</span>")).toBeGreaterThan(-1);
    expect(controlsSource.indexOf("<span>Back to Website</span>")).toBeLessThan(
      controlsSource.indexOf("Full Screen")
    );
  });

  it("uses the active school and canonical routing helper in the same tab", () => {
    expect(controlsSource).toContain(
      "getCanonicalSchoolWebsiteUrl(school, pathname, hostname)"
    );
    expect(controlsSource).toContain('aria-label="Back to Website"');
    expect(controlsSource).toContain("href={websiteHref}");
    expect(controlsSource).not.toMatch(/\btarget\s*=/);
    expect(controlsSource).not.toContain("deloro");
  });

  it("preserves fullscreen and tenant-scoped theme controls", () => {
    expect(controlsSource).toContain("document.documentElement.requestFullscreen()");
    expect(controlsSource).toContain('scope={themeScope}');
    expect(controlsSource).toContain(
      'schoolSlug={themeScope === "kiosk" ? school : undefined}'
    );
  });

  it("uses neutral kiosk surfaces without removing school accents", () => {
    expect(kioskColorSource).not.toMatch(/#07152f|#f7f8fb/i);
    expect(kioskColorSource).not.toMatch(
      /\b(?:bg|text|border|ring)-(?:blue|indigo|sky|cyan)-/
    );
    expect(kioskColorSource).toContain("--kiosk-text: #171717");
    expect(kioskColorSource).toContain("--kiosk-bg: #fafafa");
    expect(kioskColorSource).toContain("var(--school-primary");
    expect(kioskColorSource).toContain("var(--school-accent-visible");
  });

  it("uses neutral kiosk text on the school-color bottom banner", () => {
    expect(kioskSource).toContain(
      'bg-[var(--school-primary)] text-[clamp(1rem,1.35vw,1.55rem)] font-extrabold text-[var(--kiosk-text)]'
    );
    expect(kioskSource).not.toContain(
      'font-extrabold text-[var(--school-primary-text)]'
    );
  });
});
