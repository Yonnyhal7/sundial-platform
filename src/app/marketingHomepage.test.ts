import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Sundial marketing homepage", () => {
  const page = source("src/app/page.tsx");

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
});
