import { describe, expect, it } from "vitest";
import { evaluateCalendarTextQuality } from "./pdfTextQuality";

function goodCalendarText() {
  return `
[PAGE 1]
2026-2027 School Calendar
August 12 Instruction Begins Brown Day
August 13 Gold Day
September 7 Holiday No School
October 16 Minimum Day
November 23-27 Thanksgiving Break No School
December 18 Finals
January 11 Semester 2 Begins
February 15 Holiday No School
March 15-19 Spring Break No School
April 30 Rally Schedule
May 28 Last Instructional Day
Monday Tuesday Wednesday Thursday Friday
Brown Day Gold Day Brown Day Gold Day Brown Day
`.repeat(4);
}

describe("calendar PDF text quality", () => {
  it("marks a good text layer usable for the GPT-5 mini path", () => {
    const quality = evaluateCalendarTextQuality({
      text: goodCalendarText(),
      pageCount: 2,
    });

    expect(quality.usable).toBe(true);
    expect(quality.reasonCodes).toEqual(["text_path_safe", "text_usable"]);
    expect(quality.score).toBeGreaterThanOrEqual(62);
  });

  it("keeps explicit textual Brown/Gold date assignments on the fast path", () => {
    const quality = evaluateCalendarTextQuality({
      text: `
[PAGE 1]
2026-2027 Brown Gold Calendar
August 12 Brown Day
August 13 Gold Day
August 14 Brown Day
August 17 Gold Day
August 18 Brown Day
August 19 Gold Day
August 20 Brown Day
August 21 Gold Day
September 4 All Periods
December 18 Finals
January 11 Brown Day
January 12 Gold Day
February 15 Holiday No School
March 15 Spring Break No School
April 30 Rally
May 28 Last Instructional Day
Monday Tuesday Wednesday Thursday Friday
`.repeat(3),
      pageCount: 2,
    });

    expect(quality.usable).toBe(true);
    expect(quality.likelyVisualLayoutDependency).toBe(false);
  });

  it("routes scanned or empty PDFs to full PDF fallback", () => {
    const quality = evaluateCalendarTextQuality({ text: "", pageCount: 3 });

    expect(quality.usable).toBe(false);
    expect(quality.reasonCodes).toContain("no_text_layer");
    expect(quality.reasonCodes).toContain("likely_scanned_pdf");
  });

  it("routes weak text with insufficient date signals to fallback", () => {
    const quality = evaluateCalendarTextQuality({
      text: "[PAGE 1]\nWelcome to school\nCalendar coming soon",
      pageCount: 1,
    });

    expect(quality.usable).toBe(false);
    expect(quality.reasonCodes).toContain("insufficient_date_signals");
  });

  it("routes likely color legend or visual grid calendars to fallback", () => {
    const quality = evaluateCalendarTextQuality({
      text: `
[PAGE 1]
Calendar Legend
Brown = Brown Day
Gold = Gold Day
Blue shaded boxes are holidays
Green circles indicate rallies
Use highlighted color cells for schedule assignment
January February March April May June July August September October November December
`.repeat(5),
      pageCount: 1,
    });

    expect(quality.usable).toBe(false);
    expect(quality.likelyVisualLayoutDependency).toBe(true);
    expect(quality.reasonCodes).toContain("likely_color_legend_dependency");
  });

  it("routes Brown/Gold-style visual legends directly to PDF analysis", () => {
    const quality = evaluateCalendarTextQuality({
      text: `
[PAGE 1]
2026-2027 Brown Gold Calendar
August September October November December January February March April May
Monday Tuesday Wednesday Thursday Friday
1 2 3 4 5 8 9 10 11 12 15 16 17 18 19 22 23 24 25 26
Calendar Legend / Key
Brown = Brown Day
Gold = Gold Day
Blue = Finals
Gray shaded boxes = No School
All Periods
Use the color of each date cell to determine the schedule.
`.repeat(4),
      pageCount: 2,
    });

    expect(quality.usable).toBe(false);
    expect(quality.likelyVisualLayoutDependency).toBe(true);
    expect(quality.reasonCodes).toContain("visual_schedule_legend");
    expect(quality.reasonCodes).toContain("color_encoded_date_assignments");
    expect(quality.reasonCodes).toContain("schedule_names_without_text_mapping");
    expect(quality.reasonCodes).toContain("calendar_grid_requires_visual_analysis");
  });

  it("routes multiple schedule names without dated text mapping to visual analysis", () => {
    const quality = evaluateCalendarTextQuality({
      text: `
[PAGE 1]
Student Attendance Calendar
August September October November December January February March April May
Monday Tuesday Wednesday Thursday Friday
1 2 3 4 5 8 9 10 11 12 15 16 17 18 19 22 23 24 25 26
Brown Day
Gold Day
Finals
All Periods
`.repeat(4),
      pageCount: 2,
    });

    expect(quality.usable).toBe(false);
    expect(quality.reasonCodes).toContain("schedule_names_without_text_mapping");
  });

  it("rejects unreadable extraction noise", () => {
    const quality = evaluateCalendarTextQuality({
      text: `${goodCalendarText()}\n${"\uFFFD".repeat(800)}`,
      pageCount: 2,
    });

    expect(quality.usable).toBe(false);
    expect(quality.reasonCodes).toContain("unreadable_characters");
  });
});
