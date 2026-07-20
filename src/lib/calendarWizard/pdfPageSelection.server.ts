import "server-only";

import { PDFDocument } from "pdf-lib";
import type { ExtractedCalendarText } from "./pdfTextExtraction.server";

export const CALENDAR_PAGE_SELECTION_VERSION = "page-selection-v1";

export type CalendarPageRole =
  | "student_calendar"
  | "supporting_legend"
  | "unrelated_personnel_calendar"
  | "unrelated_document"
  | "unknown";

export type CalendarPageSelection = {
  version: typeof CALENDAR_PAGE_SELECTION_VERSION;
  classifications: Array<{ page: number; role: CalendarPageRole }>;
  selectedPages: number[];
  excludedPages: number[];
};

const STUDENT_SIGNALS = [
  /\bstudent attendance calendar\b/i,
  /\binstructional days?\b/i,
  /\binstruction begins?\b/i,
  /\bterms? ends?\b/i,
  /\bschool months?\b/i,
];
const PERSONNEL_SIGNALS = [
  /\bclassified personnel holidays?\b/i,
  /\bhuman resources\b/i,
  /\btotal holidays?\b/i,
];
const LEGEND_SIGNALS = [/\blegend\b/i, /\bminimum day\b/i, /\bno school\b/i];

function signalCount(text: string, signals: RegExp[]) {
  return signals.reduce((count, signal) => count + Number(signal.test(text)), 0);
}

export function classifyCalendarPages(pages: string[]): CalendarPageSelection {
  const classifications = pages.map((text, index) => {
    const student = signalCount(text, STUDENT_SIGNALS);
    const personnel = signalCount(text, PERSONNEL_SIGNALS);
    let role: CalendarPageRole;
    if (personnel >= 1 && personnel >= student) role = "unrelated_personnel_calendar";
    else if (student >= 1) role = "student_calendar";
    else if (signalCount(text, LEGEND_SIGNALS) >= 2) role = "supporting_legend";
    else if (text.trim().length < 40) role = "unknown";
    else role = "unrelated_document";
    return { page: index + 1, role };
  });
  const selectedPages = classifications
    .filter(({ role }) => role === "student_calendar" || role === "supporting_legend")
    .map(({ page }) => page);
  return {
    version: CALENDAR_PAGE_SELECTION_VERSION,
    classifications,
    selectedPages,
    excludedPages: classifications
      .filter(({ page }) => !selectedPages.includes(page))
      .map(({ page }) => page),
  };
}

export function selectExtractedCalendarText(
  extracted: ExtractedCalendarText,
  selection: CalendarPageSelection
): ExtractedCalendarText {
  const selected = new Set(selection.selectedPages);
  const sourcePages = extracted.pages || extracted.text
    .split(/\n(?=\[PAGE \d+\]\n)/)
    .map((page) => page.replace(/^\[PAGE \d+\]\n/, ""));
  const pages = sourcePages.filter((_, index) => selected.has(index + 1));
  const text = pages.map((page, index) => {
    const originalPage = selection.selectedPages[index];
    return `[PAGE ${originalPage}]\n${page}`;
  }).join("\n\n");
  return {
    ...extracted,
    text,
    pages,
    extractedCharacterCount: text.length,
    extractedLineCount: text.split("\n").filter((line) => line.trim()).length,
  };
}

export async function selectPdfPages(file: File, selectedPages: number[]) {
  if (!selectedPages.length) return file;
  const source = await PDFDocument.load(await file.arrayBuffer());
  if (selectedPages.length === source.getPageCount()) return file;
  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, selectedPages.map((page) => page - 1));
  copied.forEach((page) => output.addPage(page));
  const bytes = await output.save({ useObjectStreams: false });
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([buffer], file.name || "calendar.pdf", { type: "application/pdf" });
}
