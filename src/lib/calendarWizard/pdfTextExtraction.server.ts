import "server-only";

import { MAX_CALENDAR_IMPORT_PAGES } from "./aiPdfValidation";
import { ensurePdfjsNodeCanvasPolyfills } from "./pdfVectorCalendarExtraction.server";
import { loadPdfjsWorkerDataUrlForRuntime } from "./pdfjsWorker.server";

export const MAX_EXTRACTED_CALENDAR_TEXT_CHARS = 55_000;

export type ExtractedCalendarText = {
  text: string;
  pages?: string[];
  pageCount: number;
  extractedCharacterCount: number;
  extractedLineCount: number;
  truncated: boolean;
};

const CALENDAR_RELEVANT_LINE_PATTERN =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|mon|tue|wed|thu|fri|sat|sun|holiday|no school|minimum|rally|finals?|semester|instruction|begins?|brown|gold|day|schedule|break|teacher|work|inservice|testing|early release|\d{1,2}[/-]\d{1,2}|\d{4})\b/i;

function cleanPageText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function removeSafeRepeatedHeadersAndFooters(pages: string[]) {
  if (pages.length < 3) return pages;

  const firstLines = new Map<string, number>();
  const lastLines = new Map<string, number>();

  for (const page of pages) {
    const lines = page.split("\n").filter(Boolean);
    const first = lines[0];
    const last = lines[lines.length - 1];

    if (first && first.length < 90 && !CALENDAR_RELEVANT_LINE_PATTERN.test(first)) {
      firstLines.set(first, (firstLines.get(first) || 0) + 1);
    }
    if (last && last.length < 90 && !CALENDAR_RELEVANT_LINE_PATTERN.test(last)) {
      lastLines.set(last, (lastLines.get(last) || 0) + 1);
    }
  }

  const repeatedFirst = new Set(
    [...firstLines.entries()]
      .filter(([, count]) => count >= Math.max(3, Math.ceil(pages.length * 0.6)))
      .map(([line]) => line)
  );
  const repeatedLast = new Set(
    [...lastLines.entries()]
      .filter(([, count]) => count >= Math.max(3, Math.ceil(pages.length * 0.6)))
      .map(([line]) => line)
  );

  return pages.map((page) => {
    const lines = page.split("\n");
    if (repeatedFirst.has(lines[0])) lines.shift();
    if (repeatedLast.has(lines[lines.length - 1])) lines.pop();
    return lines.join("\n").trim();
  });
}

function limitExtractedText(text: string) {
  if (text.length <= MAX_EXTRACTED_CALENDAR_TEXT_CHARS) {
    return { text, truncated: false };
  }

  const retainedLines: string[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("[PAGE ") || CALENDAR_RELEVANT_LINE_PATTERN.test(line)) {
      retainedLines.push(line);
    }
  }

  const retainedText = retainedLines.join("\n");
  if (retainedText.length <= MAX_EXTRACTED_CALENDAR_TEXT_CHARS) {
    return { text: retainedText, truncated: true };
  }

  const chunks = retainedText.split(/\n(?=\[PAGE \d+\])/g);
  let next = "";
  for (const chunk of chunks) {
    if (next.length + chunk.length + 1 > MAX_EXTRACTED_CALENDAR_TEXT_CHARS) {
      break;
    }
    next += `${next ? "\n" : ""}${chunk}`;
  }

  return {
    text: next || retainedText.slice(0, MAX_EXTRACTED_CALENDAR_TEXT_CHARS),
    truncated: true,
  };
}

export async function extractCalendarPdfText(file: File): Promise<ExtractedCalendarText> {
  const startedAt = Date.now();
  const data = new Uint8Array(await file.arrayBuffer());
  let document: Awaited<ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs")["getDocument"]>["promise"]> | null = null;

  try {
    ensurePdfjsNodeCanvasPolyfills();
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    GlobalWorkerOptions.workerSrc = await loadPdfjsWorkerDataUrlForRuntime();
    document = await getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
    const totalPages = document.numPages;

    if (totalPages > MAX_CALENDAR_IMPORT_PAGES) {
      throw new Error(`Calendar PDFs must be ${MAX_CALENDAR_IMPORT_PAGES} pages or fewer.`);
    }

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.flatMap((item) => "str" in item ? [item.str] : []).join("\n"));
    }
    const cleanedPages = removeSafeRepeatedHeadersAndFooters(pages.map(cleanPageText));
    const withMarkers = cleanedPages
      .map((page, index) => `[PAGE ${index + 1}]\n${page}`.trim())
      .join("\n\n");
    const limited = limitExtractedText(withMarkers);
    const lineCount = limited.text.split("\n").filter((line) => line.trim()).length;

    console.info("AI calendar import diagnostic", {
      event: "pdf_text_extraction_finished",
      pageCount: totalPages,
      extractedCharacterCount: limited.text.length,
      extractedLineCount: lineCount,
      truncated: limited.truncated,
      durationMs: Date.now() - startedAt,
    });

    return {
      text: limited.text,
      pages: cleanedPages,
      pageCount: totalPages,
      extractedCharacterCount: limited.text.length,
      extractedLineCount: lineCount,
      truncated: limited.truncated,
    };
  } catch (error) {
    console.warn("AI calendar import diagnostic", {
      event: "pdf_text_extraction_failed",
      reasonCode: "local_pdf_parser_failed",
      category: error instanceof Error ? error.name : "unknown",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  } finally {
    await document?.destroy();
  }
}
