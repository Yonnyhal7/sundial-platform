import "server-only";

import { MAX_CALENDAR_IMPORT_PAGES } from "./aiPdfValidation";

export type PdfVectorAssignment = {
  date: string;
  scheduleName: string;
  color: string;
  source: "pdf_vector_fill";
  confidence: number;
  page: number;
};

export type PdfVectorLegendEntry = {
  color: string;
  scheduleName: string;
  confidence: number;
  page: number;
};

export type PdfVectorCalendarResult = {
  supported: boolean;
  confidence: number;
  gridConfidence: number;
  legendConfidence: number;
  legend: PdfVectorLegendEntry[];
  assignments: PdfVectorAssignment[];
  firstInstructionalDate?: string;
  firstInstructionalSchedule?: string;
  firstInstructionalSource?: "pdf_vector_fill";
  reasonCodes: string[];
  durationMs: number;
};

type PositionedText = { text: string; x: number; y: number; width: number; height: number; page: number };
type ColoredRect = { x: number; y: number; width: number; height: number; color: string; page: number };
type Matrix = [number, number, number, number, number, number];

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const SCHEDULE_LABEL = /\b(day\s*\d+|[a-z]+\s+day|all\s*periods?|periods?\s*\d|finals?|minimum|rally|testing|early\s+release|odd|even)\b/i;

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function transformPoint(m: Matrix, x: number, y: number) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function byte(value: unknown) {
  const number = Number(value);
  return Math.max(0, Math.min(255, Math.round(number <= 1 ? number * 255 : number)));
}

function colorHex(args: unknown[]): string {
  const [r = 0, g = 0, b = 0] = args;
  return `#${[byte(r), byte(g), byte(b)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function colorDistance(a: string, b: string) {
  const channels = (value: string) => [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  const ac = channels(a);
  const bc = channels(b);
  return Math.sqrt(ac.reduce((sum, value, index) => sum + (value - bc[index]) ** 2, 0));
}

function isWhite(color: string) {
  return colorDistance(color, "#ffffff") < 24;
}

function contains(rect: ColoredRect, text: PositionedText) {
  const cx = text.x + text.width / 2;
  const cy = text.y + text.height / 2;
  return cx >= rect.x - 2 && cx <= rect.x + rect.width + 2 && cy >= rect.y - 2 && cy <= rect.y + rect.height + 2;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function nearestMonth(text: PositionedText, texts: PositionedText[]) {
  const candidates = texts.flatMap((item) => {
    const match = item.text.toLowerCase().match(new RegExp(`\\b(${MONTHS.join("|")})\\b(?:\\s+(20\\d{2}))?`));
    if (!match || item.page !== text.page) return [];
    const distance = Math.abs(item.x - text.x) + Math.abs(item.y - text.y) * 0.35;
    return [{ month: MONTHS.indexOf(match[1]), year: match[2] ? Number(match[2]) : undefined, distance, item }];
  }).sort((a, b) => a.distance - b.distance);
  return candidates[0];
}

function inferYear(month: number, explicitYear: number | undefined, allText: string) {
  if (explicitYear) return explicitYear;
  const years = [...allText.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  if (!years.length) return undefined;
  const start = Math.min(...years);
  return month < 6 ? start + 1 : start;
}

export function matchVectorCalendarStructure(texts: PositionedText[], rectangles: ColoredRect[]): Omit<PdfVectorCalendarResult, "durationMs"> {
  const nonWhite = rectangles.filter((rect) => !isWhite(rect.color) && rect.width > 3 && rect.height > 3);
  const typicalWidth = median(rectangles.filter((r) => r.width > 12).map((r) => r.width));
  const typicalHeight = median(rectangles.filter((r) => r.height > 12).map((r) => r.height));
  const cellRects = rectangles.filter((rect) =>
    typicalWidth > 0 && typicalHeight > 0 &&
    Math.abs(rect.width - typicalWidth) / typicalWidth < 0.3 &&
    Math.abs(rect.height - typicalHeight) / typicalHeight < 0.3
  );
  const dateCells = cellRects.flatMap((rect) => {
    const dateText = texts.find((item) => item.page === rect.page && /^(?:[1-9]|[12]\d|3[01])$/.test(item.text.trim()) && contains(rect, item));
    if (!dateText) return [];
    const month = nearestMonth(dateText, texts);
    const monthNumber = month?.month;
    const year = monthNumber === undefined ? undefined : inferYear(monthNumber, month.year, texts.map((item) => item.text).join(" "));
    if (monthNumber === undefined || !year) return [];
    const day = Number(dateText.text.trim());
    return [{ rect, dateText, date: `${year}-${String(monthNumber + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` }];
  });

  const legend: PdfVectorLegendEntry[] = nonWhite.flatMap((rect) => {
    if (dateCells.some((cell) => cell.rect === rect)) return [];
    const nearby = texts
      .filter((item) => item.page === rect.page && SCHEDULE_LABEL.test(item.text) &&
        item.x >= rect.x - rect.width && item.x <= rect.x + rect.width * 5 &&
        Math.abs((item.y + item.height / 2) - (rect.y + rect.height / 2)) <= Math.max(rect.height, item.height) * 1.5)
      .sort((a, b) => Math.abs(a.x - rect.x) - Math.abs(b.x - rect.x))[0];
    return nearby ? [{ color: rect.color, scheduleName: nearby.text.trim(), confidence: 0.98, page: rect.page }] : [];
  }).filter((entry, index, entries) => entries.findIndex((other) => colorDistance(other.color, entry.color) < 12) === index);

  const assignments: PdfVectorAssignment[] = dateCells.flatMap(({ rect, date }) => {
    if (isWhite(rect.color)) return [];
    const matches = legend.map((entry) => ({ entry, distance: colorDistance(entry.color, rect.color) })).sort((a, b) => a.distance - b.distance);
    if (!matches[0] || matches[0].distance > 45) return [];
    const confidence = Math.max(0.75, Math.min(1, 1 - matches[0].distance / 180));
    return [{ date, scheduleName: matches[0].entry.scheduleName, color: rect.color, source: "pdf_vector_fill" as const, confidence, page: rect.page }];
  }).filter((assignment, index, entries) => entries.findIndex((other) => other.date === assignment.date) === index)
    .sort((a, b) => a.date.localeCompare(b.date));

  const gridConfidence = dateCells.length >= 20 ? 0.98 : dateCells.length >= 10 ? 0.85 : dateCells.length >= 5 ? 0.7 : 0;
  const legendConfidence = legend.length >= 2 ? 0.98 : legend.length === 1 ? 0.78 : 0;
  const coverage = dateCells.length ? assignments.length / dateCells.filter((cell) => !isWhite(cell.rect.color)).length : 0;
  const confidence = Math.min(gridConfidence, legendConfidence, coverage || 0);
  const first = assignments[0];
  const reasonCodes = [
    ...(dateCells.length < 5 ? ["calendar_grid_not_identified"] : []),
    ...(legend.length === 0 ? ["legend_not_identified"] : []),
    ...(coverage < 0.75 ? ["ambiguous_color_assignments"] : []),
  ];
  return {
    supported: confidence >= 0.95 && assignments.length > 0,
    confidence,
    gridConfidence,
    legendConfidence,
    legend,
    assignments,
    firstInstructionalDate: first?.date,
    firstInstructionalSchedule: first?.scheduleName,
    firstInstructionalSource: first ? "pdf_vector_fill" : undefined,
    reasonCodes,
  };
}

export async function extractPdfVectorCalendar(file: File): Promise<PdfVectorCalendarResult> {
  const startedAt = Date.now();
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
  const document = await loadingTask.promise;
  const texts: PositionedText[] = [];
  const rectangles: ColoredRect[] = [];
  try {
    if (document.numPages > MAX_CALENDAR_IMPORT_PAGES) throw new Error(`Calendar PDFs must be ${MAX_CALENDAR_IMPORT_PAGES} pages or fewer.`);
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
      for (const item of content.items) {
        if (!("str" in item)) continue;
        texts.push({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, page: pageNumber });
      }
      let fill = "#000000";
      let ctm: Matrix = [1, 0, 0, 1, 0, 0];
      const stack: Matrix[] = [];
      let pending: Array<Omit<ColoredRect, "color" | "page">> = [];
      for (let index = 0; index < operators.fnArray.length; index += 1) {
        const op = operators.fnArray[index];
        const args = operators.argsArray[index] as unknown[];
        if (op === OPS.save) stack.push([...ctm] as Matrix);
        else if (op === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (op === OPS.transform) ctm = multiply(ctm, args.map(Number) as Matrix);
        else if (op === OPS.setFillRGBColor) fill = colorHex(args);
        else if (op === OPS.setFillGray) fill = colorHex([args[0], args[0], args[0]]);
        else if (op === OPS.constructPath) {
          const pathOps = args[0] as number[];
          const coords = Array.from((args[1] as ArrayLike<number>[] | undefined)?.[0] || []);
          let cursor = 0;
          for (const pathOp of pathOps || []) {
            if (pathOp === OPS.rectangle) {
              const [x, y, width, height] = coords.slice(cursor, cursor + 4);
              const a = transformPoint(ctm, x, y);
              const b = transformPoint(ctm, x + width, y + height);
              pending.push({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) });
              cursor += 4;
            } else cursor += pathOp === OPS.moveTo || pathOp === OPS.lineTo ? 2 : pathOp >= OPS.curveTo && pathOp <= OPS.curveTo3 ? 6 : 0;
          }
        } else if ([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(op)) {
          rectangles.push(...pending.map((rect) => ({ ...rect, color: fill, page: pageNumber })));
          pending = [];
        } else if (op === OPS.endPath || op === OPS.stroke) pending = [];
      }
    }
    return { ...matchVectorCalendarStructure(texts, rectangles), durationMs: Date.now() - startedAt };
  } finally {
    await document.destroy();
  }
}
