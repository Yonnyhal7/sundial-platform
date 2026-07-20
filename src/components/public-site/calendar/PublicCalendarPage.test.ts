import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/public-site/calendar/PublicCalendarPage.tsx"), "utf8").replace(/\r\n/g, "\n");
const page = readFileSync(resolve(process.cwd(), "src/app/[school]/schedule/page.tsx"), "utf8").replace(/\r\n/g, "\n");
const loader = readFileSync(resolve(process.cwd(), "src/lib/publicCalendar.server.ts"), "utf8").replace(/\r\n/g, "\n");

describe("public school calendar contracts", () => {
  it("uses the existing public route and presents the requested page structure", () => {
    expect(page).toContain('title="School Calendar"');
    expect(page).toContain("Academic year");
    expect(page).toContain("<PublicCalendarPage");
    expect(page).not.toContain("Today&apos;s Schedule");
  });

  it("supports client-side month navigation, Today, and date selection", () => {
    expect(source).toContain('aria-label="Previous month"');
    expect(source).toContain('aria-label="Next month"');
    expect(source).toContain(">Today</button>");
    expect(source).toContain("setVisibleMonth(nextMonth)");
    expect(source).toContain("setSelectedDate");
    expect(source).not.toContain("router.push");
  });

  it("keeps a seven-column responsive grid without horizontal scrolling", () => {
    expect(source).toContain("grid grid-cols-7");
    expect(source).toContain("min-w-0");
    expect(source).toContain('className="sm:hidden"');
    expect(source).not.toContain("overflow-x-auto");
  });

  it("renders public-only details and polished incomplete states", () => {
    expect(source).toContain("Bell times have not been published yet.");
    expect(source).toContain("The school calendar has not been published yet.");
    expect(source).toContain("No school calendar information is available for this month.");
    expect(source).toContain("No School");
    expect(source).not.toContain("Save Calendar Day");
    expect(source).not.toContain("schedule_id");
  });

  it("scopes every loader query to the resolved school", () => {
    expect(loader.match(/\.eq\("school_id", school\.id\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(loader).toContain('eq("is_active", true)');
    expect(loader).toContain("requirePublicSchool(slug)");
  });
});
