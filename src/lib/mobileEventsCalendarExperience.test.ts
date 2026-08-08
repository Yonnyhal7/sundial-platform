import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("mobile events and calendar experience", () => {
  it("keeps the featured event and replaces upcoming with today's events", () => {
    for (const path of ["src/app/[school]/app/events/page.tsx", "src/components/offline/OfflineStudentAppContent.tsx"]) {
      const content = source(path);
      expect(content).toContain("Featured Event");
      expect(content).toContain("Today&apos;s Events");
      expect(content).toContain("No events today");
      expect(content).toContain("getEventsForSchoolDate");
      expect(content).not.toContain("Upcoming Events");
    }
  });

  it("renders Schedule, Events, and Sports in order with contextual empty states", () => {
    const client = source("src/components/mobile-app/CalendarScheduleClient.tsx");
    const schedule = client.indexOf(">Schedule</h3>");
    const events = client.indexOf(">Events</h3>");
    const sports = client.indexOf(">Sports</h3>");
    expect(schedule).toBeGreaterThan(-1);
    expect(schedule).toBeLessThan(events);
    expect(events).toBeLessThan(sports);
    for (const text of ["No events today", "No events scheduled", "No games today", "No games scheduled"]) expect(client).toContain(text);
  });
});
