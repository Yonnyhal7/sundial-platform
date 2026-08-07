import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Sundial marketing homepage", () => {
  const page = source("src/app/page.tsx");
  const layout = source("src/app/layout.tsx");
  const worker = source("public/sw.js");

  it("uses the official Sundial mark and real product destinations", () => {
    expect(page).toContain('src="/sundial-launch-mark.webp"');
    expect(page).toContain("https://davids.sundialk12.com");
    expect(page).toContain("https://davids.sundialk12.com/app");
    expect(page).toContain("https://davids.sundialk12.com/kiosk");
  });

  it("covers each connected product experience without fabricated proof", () => {
    for (const label of [
      "Public school website",
      "Installable mobile app",
      "Kiosk display",
      "Admin portal",
      "Calendar",
      "Bell schedules",
      "Events",
      "Athletics",
      "Announcements",
      "Quick links",
    ]) {
      expect(page).toContain(label);
    }

    expect(page).not.toMatch(/testimonial|schools trust|\d+[,+]? schools/i);
  });

  it("labels AI-assisted document importing as beta and staff-reviewed", () => {
    expect(page).toContain("AI-assisted setup");
    expect(page).toContain("The feature is in beta");
    expect(page).toContain("staff stay in control");
  });

  it("contains hero copy and layered previews in separate responsive columns", () => {
    expect(page).toContain("data-hero-copy");
    expect(page).toContain("data-hero-previews");
    expect(page).toContain(
      "2xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]"
    );
    expect(page).toContain("font-sans");
    expect(page).toContain("max-w-[10ch] break-words");
    expect(page).toContain("2xl:max-w-[38rem]");
    expect(page).toContain("min-w-0 w-full max-w-[32rem]");
    expect(page).toContain("max-w-[32rem]");
    expect(page).toContain('style={{ minHeight: "39rem" }}');
    expect(page).toContain("<PhonePreview compact />");
    expect(page).toContain('data-experience-preview="kiosk"');
    expect(page).toContain('data-experience-preview="admin"');
    expect(page).toContain("w-full max-w-[30rem]");
    expect(page).not.toContain("-translate-x-[42%]");
    expect(page).not.toContain("-translate-x-[68%]");
    expect(page).not.toContain("-translate-x-[82%]");
  });

  it("uses the self-hosted Geist font instead of a platform-dependent fallback", () => {
    expect(layout).toContain("--font-geist-sans");
    expect(page).toContain("font-sans");
  });

  it("does not serve marketing HTML from the PWA navigation cache", () => {
    expect(worker).toContain(
      'request.mode === "navigate" && isAppOrKioskPath(url.pathname)'
    );
    expect(worker).not.toMatch(
      /request\.mode === ["']navigate["'][\s\S]{0,120}url\.pathname === ["']\/["']/
    );
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
  });
});
