import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CalendarDateCell, SchoolCalendarMonthGrid } from "./SchoolCalendar";

describe("SchoolCalendar date styling", () => {
  it("keeps neutral weekends and unassigned dates out of the no-school treatment", () => {
    const markup = renderToStaticMarkup(
      <CalendarDateCell
        day={{ date: "2026-08-15", scheduleId: null, isSchoolDay: false, isNoSchoolDay: false }}
        dayNumber={15}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(markup).not.toContain("bg-rose-50");
    expect(markup).toContain("No assignment");
  });

  it("uses the distinct no-school treatment only for actual closures", () => {
    const markup = renderToStaticMarkup(
      <CalendarDateCell
        day={{ date: "2026-09-07", scheduleId: null, isSchoolDay: false, isNoSchoolDay: true, label: "Labor Day" }}
        dayNumber={7}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(markup).toContain("bg-rose-50");
    expect(markup).toContain("Labor Day");
  });

  it("shows an amber review treatment for count-discrepancy dates", () => {
    const markup = renderToStaticMarkup(
      <CalendarDateCell
        day={{ date: "2026-08-10", scheduleId: null, isSchoolDay: false, needsReview: true, label: "Teacher Orientation" }}
        dayNumber={10}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(markup).toContain("ring-amber-400/40");
    expect(markup).toContain("needs review");
  });

  it("renders explicit empty cells before and after the active month", () => {
    const markup = renderToStaticMarkup(
      <SchoolCalendarMonthGrid
        month={new Date("2026-08-01T00:00:00Z")}
        days={[]}
        schedules={[]}
        selectedDate={null}
        onSelectDate={() => {}}
      />
    );

    expect(markup).toContain('data-calendar-empty="leading"');
    expect(markup).toContain('data-calendar-empty="trailing"');
  });

  it("shares AdminCalendarView between production and guided preview", () => {
    const production = readFileSync(
      join(process.cwd(), "src/app/[school]/admin/calendar/calendar-client.tsx"),
      "utf8"
    );
    const guided = readFileSync(
      join(process.cwd(), "src/app/[school]/admin/calendar/wizard/schedule-wizard-client.tsx"),
      "utf8"
    );

    expect(production).toContain("<AdminCalendarView");
    expect(guided).toContain("<AdminCalendarView");
    expect(guided).not.toContain("function MonthPreview(");
    expect(guided).not.toContain("function scheduleAccent(");
  });
});
