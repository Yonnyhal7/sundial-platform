import { describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

vi.mock("server-only", () => ({}));
import {
  classifyCalendarPages,
  selectExtractedCalendarText,
  selectPdfPages,
} from "./pdfPageSelection.server";
import { extractCalendarPdfText } from "./pdfTextExtraction.server";

const STUDENT_PAGE = [
  "Kern High School District STUDENT ATTENDANCE CALENDAR 2026-2027",
  "Instruction begins August 12. 180 instructional days. Term ends May 28.",
  "School months August through May.",
].join("\n");
const PERSONNEL_PAGE = [
  "CLASSIFIED PERSONNEL HOLIDAYS 2026-2027",
  "Human Resources",
  "Total Holidays: 15",
].join("\n");

describe("deterministic calendar PDF page selection", () => {
  it("selects the student calendar and excludes personnel holidays identically 10 times", () => {
    const outcomes = Array.from({ length: 10 }, () => classifyCalendarPages([
      STUDENT_PAGE,
      PERSONNEL_PAGE,
    ]));
    expect(new Set(outcomes.map((outcome) => JSON.stringify(outcome))).size).toBe(1);
    expect(outcomes[0]).toMatchObject({
      selectedPages: [1],
      excludedPages: [2],
      classifications: [
        { page: 1, role: "student_calendar" },
        { page: 2, role: "unrelated_personnel_calendar" },
      ],
    });
  });

  it("removes excluded text before AI analysis", () => {
    const selection = classifyCalendarPages([STUDENT_PAGE, PERSONNEL_PAGE]);
    const selected = selectExtractedCalendarText({
      text: `[PAGE 1]\n${STUDENT_PAGE}\n\n[PAGE 2]\n${PERSONNEL_PAGE}`,
      pages: [STUDENT_PAGE, PERSONNEL_PAGE],
      pageCount: 2,
      extractedCharacterCount: 1,
      extractedLineCount: 1,
      truncated: false,
    }, selection);
    expect(selected.text).toContain("STUDENT ATTENDANCE CALENDAR");
    expect(selected.text).not.toContain("PERSONNEL HOLIDAYS");
  });

  it("builds a one-page visual fallback containing only the selected page", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    for (const text of [STUDENT_PAGE, PERSONNEL_PAGE]) {
      const page = source.addPage([612, 792]);
      page.drawText(text, { x: 30, y: 740, font, size: 10, maxWidth: 550 });
    }
    const bytes = await source.save();
    const file = new File([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], "benchmark.pdf", { type: "application/pdf" });
    const scoped = await selectPdfPages(file, [1]);
    const extracted = await extractCalendarPdfText(scoped);
    expect(extracted.pageCount).toBe(1);
    expect(extracted.text).toContain("STUDENT ATTENDANCE CALENDAR");
    expect(extracted.text).not.toContain("PERSONNEL HOLIDAYS");
  });
});
