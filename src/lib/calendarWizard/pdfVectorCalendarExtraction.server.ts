import "server-only";

import { MAX_CALENDAR_IMPORT_PAGES } from "./aiPdfValidation";
import { loadPdfjsWorkerDataUrlForRuntime } from "./pdfjsWorker.server";
import { computeDatedScheduleAssignmentDigest } from "./assignmentDigest";

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
  // Some pdfjs-dist versions pre-format the fill color as a CSS hex string
  // (e.g. ["#ff0000"]) instead of separate [r, g, b] numeric channels.
  const [first] = args;
  if (typeof first === "string" && /^#[0-9a-fA-F]{6}$/.test(first)) {
    return first.toLowerCase();
  }
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

/**
 * Real calendar PDFs mix many rectangle "purposes" (day cells, header bars, week-spanning
 * merged holiday bands, legend swatches). A single page-wide median width/height is easily
 * pulled off the true day-cell size by those unrelated shapes. Instead, find the width that
 * repeats most often (the day-cell grid is by far the most repeated shape on the page), then
 * take the median height only among rects that already share that width.
 */
function typicalCellSize(rectangles: ColoredRect[]) {
  const widthCounts = new Map<number, number>();
  for (const rect of rectangles) {
    if (rect.width <= 12) continue;
    const bucket = Math.round(rect.width * 2) / 2;
    widthCounts.set(bucket, (widthCounts.get(bucket) || 0) + 1);
  }
  let typicalWidth = 0;
  let bestCount = 0;
  for (const [width, count] of widthCounts) {
    if (count > bestCount) {
      typicalWidth = width;
      bestCount = count;
    }
  }
  if (!typicalWidth) return { typicalWidth: 0, typicalHeight: 0 };
  const widthMatched = rectangles.filter(
    (rect) => Math.abs(rect.width - typicalWidth) / typicalWidth < 0.15
  );
  return { typicalWidth, typicalHeight: median(widthMatched.map((rect) => rect.height)) };
}

/**
 * Compact wallet-style calendars stack month blocks vertically, each block's header sitting at
 * (or above) the first of its own rows, with a separate notes column to the side. A header can
 * legitimately name two months ("SEPTEMBER - OCTOBER") when its rows roll over mid-month.
 * Proximity search must therefore: (1) only ever consider a header that sits at or above the
 * row being resolved (never a block below it), and (2) prefer the header column over any
 * same-row notation text that happens to also mention a month name.
 */
function nearestMonthHeader(text: PositionedText, texts: PositionedText[], headerColumnMaxX: number) {
  const candidates = texts.flatMap((item) => {
    if (item.page !== text.page || item.x >= headerColumnMaxX || item.y < text.y - 3) return [];
    const matches = [...item.text.toLowerCase().matchAll(new RegExp(`\\b(${MONTHS.join("|")})\\b(?:\\s+(20\\d{2}))?`, "g"))];
    if (!matches.length) return [];
    const distance = (item.y - text.y) + Math.abs(item.x - text.x) * 0.05;
    return [{
      months: matches.map((match) => MONTHS.indexOf(match[1])),
      year: matches[0][2] ? Number(matches[0][2]) : undefined,
      distance,
      item,
    }];
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
  const { typicalWidth, typicalHeight } = typicalCellSize(rectangles);
  const cellRects = rectangles.filter((rect) =>
    typicalWidth > 0 && typicalHeight > 0 &&
    Math.abs(rect.width - typicalWidth) / typicalWidth < 0.15 &&
    Math.abs(rect.height - typicalHeight) / typicalHeight < 0.3
  );
  const dayCandidates = cellRects.flatMap((rect) => {
    const dateText = texts.find((item) => item.page === rect.page && /^(?:[1-9]|[12]\d|3[01])$/.test(item.text.trim()) && contains(rect, item));
    return dateText ? [{ rect, dateText, day: Number(dateText.text.trim()) }] : [];
  });
  const allText = texts.map((item) => item.text).join(" ");
  const headerColumnMaxX = dayCandidates.length
    ? Math.min(...dayCandidates.map((cell) => cell.dateText.x))
    : Infinity;

  // Group into visual rows (same page + y), then retain rollover state across every row under
  // a two-month header. Some PDFs omit an uncolored boundary date from the detected cells, so
  // the visible rollover may occur between rows rather than inside one row.
  const rows: Array<typeof dayCandidates> = [];
  for (const cell of dayCandidates) {
    // Text baselines can differ by more than a point inside the same visual row (parentheses,
    // font fallback, and digit glyph metrics all affect PDF text transforms). The cell
    // rectangles themselves share a stable row origin, which preserves month rollover such as
    // AUGUST-SEPTEMBER's `31, 1, 2, 3, 4` row.
    const row = rows.find((candidate) =>
      candidate[0]?.rect.page === cell.rect.page &&
      Math.abs(candidate[0].rect.y - cell.rect.y) <= Math.max(2, typicalHeight * 0.2)
    );
    if (row) row.push(cell);
    else rows.push([cell]);
  }

  const monthBlockStates = new Map<PositionedText, { monthIndex: number; previousDay: number }>();
  const dateCells = rows
    .sort((a, b) => a[0].rect.page - b[0].rect.page || b[0].rect.y - a[0].rect.y)
    .flatMap((row) => {
      const sorted = [...row].sort((a, b) => a.dateText.x - b.dateText.x);
      return sorted.flatMap((cell) => {
        const header = nearestMonthHeader(cell.dateText, texts, headerColumnMaxX);
        if (!header) return [];
        const state = monthBlockStates.get(header.item) || { monthIndex: 0, previousDay: -Infinity };
        if (cell.day < state.previousDay && state.monthIndex < header.months.length - 1) {
          state.monthIndex += 1;
        }
        state.previousDay = cell.day;
        monthBlockStates.set(header.item, state);
        const monthNumber = header.months[Math.min(state.monthIndex, header.months.length - 1)];
        const year = inferYear(monthNumber, header.year, allText);
        if (monthNumber === undefined || !year) return [];
        return [{
          rect: cell.rect,
          dateText: cell.dateText,
          date: `${year}-${String(monthNumber + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`,
        }];
      });
    });

  // Legend swatches in real calendar exports are usually small colored pills that the label
  // text is drawn on top of (contained within), not a swatch beside separately-flowed text.
  // Matching by containment (picking the smallest containing rect, so a legend section's
  // outer border box never wins over the specific swatch inside it) avoids false matches
  // against unrelated same-colored day cells and marginal notes elsewhere on the page.
  const dateCellRectSet = new Set(dateCells.map((cell) => cell.rect));
  const legendCandidates = nonWhite.filter((rect) => !dateCellRectSet.has(rect));
  const scheduleLabelTexts = texts.filter((item) => SCHEDULE_LABEL.test(item.text));
  const bestSwatchForLabel = new Map<PositionedText, { rect: ColoredRect; area: number }>();
  for (const rect of legendCandidates) {
    const area = rect.width * rect.height;
    for (const label of scheduleLabelTexts) {
      if (label.page !== rect.page || !contains(rect, label)) continue;
      const current = bestSwatchForLabel.get(label);
      if (!current || area < current.area) bestSwatchForLabel.set(label, { rect, area });
    }
  }
  let legendEntries = [...bestSwatchForLabel.entries()].map(([label, { rect, area }]) => ({
    color: rect.color,
    scheduleName: label.text.trim(),
    confidence: 0.98,
    page: rect.page,
    area,
  }));
  if (legendEntries.length === 0) {
    // Fallback for layouts where a small swatch sits beside separately-flowed label text.
    legendEntries = legendCandidates.flatMap((rect) => {
      const nearby = texts
        .filter((item) => item.page === rect.page && SCHEDULE_LABEL.test(item.text) &&
          item.x >= rect.x - rect.width && item.x <= rect.x + rect.width * 5 &&
          Math.abs((item.y + item.height / 2) - (rect.y + rect.height / 2)) <= Math.max(rect.height, item.height) * 1.5)
        .sort((a, b) => Math.abs(a.x - rect.x) - Math.abs(b.x - rect.x))[0];
      return nearby ? [{ color: rect.color, scheduleName: nearby.text.trim(), confidence: 0.9, page: rect.page, area: rect.width * rect.height }] : [];
    });
  }
  // Same-colored decorative shading elsewhere on the page (e.g. striped note rows reusing the
  // legend palette) can also contain a schedule-label-shaped word. When two candidates share a
  // color, prefer the one with the tightest (smallest-area) containing rect: the true legend
  // swatch is a small pill, while incidental matches tend to sit inside larger shapes.
  const dedupedLegend: typeof legendEntries = [];
  for (const entry of legendEntries) {
    const existingIndex = dedupedLegend.findIndex((other) => colorDistance(other.color, entry.color) < 12);
    if (existingIndex === -1) dedupedLegend.push(entry);
    else if (entry.area < dedupedLegend[existingIndex].area) dedupedLegend[existingIndex] = entry;
  }
  const legend: PdfVectorLegendEntry[] = dedupedLegend.map((entry) => ({
    color: entry.color,
    scheduleName: entry.scheduleName,
    confidence: entry.confidence,
    page: entry.page,
  }));

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

/**
 * pdfjs-dist's Node build unconditionally constructs a DOMMatrix (and references
 * Path2D/ImageData) at module load time for its canvas-rendering support, even though
 * getTextContent()/getOperatorList() never render anything. It tries to source these from
 * the optional native "@napi-rs/canvas" package first; if that package's platform binary
 * isn't available in a given deployment (bundling native addons for serverless is fragile),
 * it just warns and leaves the globals undefined — which then crashes the import itself with
 * a ReferenceError. We only ever read operator-list data, never render, so a non-functional
 * stub is enough: nothing in our code path invokes DOMMatrix/Path2D/ImageData methods.
 */
export function ensurePdfjsNodeCanvasPolyfills() {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.DOMMatrix) {
    g.DOMMatrix = class DOMMatrixPolyfill {};
  }
  if (!g.Path2D) {
    g.Path2D = class Path2DPolyfill {};
  }
  if (!g.ImageData) {
    g.ImageData = class ImageDataPolyfill {};
  }
}

export async function extractPdfVectorCalendar(file: File, selectedPages?: number[]): Promise<PdfVectorCalendarResult> {
  const startedAt = Date.now();
  ensurePdfjsNodeCanvasPolyfills();
  // pdf.js creates a "fake worker" in Node, but still resolves GlobalWorkerOptions.workerSrc.
  // Read the traced package worker and convert it to an in-memory URL: fake-worker startup no
  // longer depends on a generated `.next/server/chunks/pdf.worker.mjs` path.
  const { getDocument, OPS, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = await loadPdfjsWorkerDataUrlForRuntime();
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
  const document = await loadingTask.promise;
  const texts: PositionedText[] = [];
  const rectangles: ColoredRect[] = [];
  try {
    if (document.numPages > MAX_CALENDAR_IMPORT_PAGES) throw new Error(`Calendar PDFs must be ${MAX_CALENDAR_IMPORT_PAGES} pages or fewer.`);
    const includedPages = new Set(selectedPages || Array.from({ length: document.numPages }, (_, index) => index + 1));
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (!includedPages.has(pageNumber)) continue;
      const page = await document.getPage(pageNumber);
      const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
      for (const item of content.items) {
        if (!("str" in item)) continue;
        texts.push({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, page: pageNumber });
      }
      let fill = "#000000";
      let ctm: Matrix = [1, 0, 0, 1, 0, 0];
      const stack: Matrix[] = [];
      let pendingMinMax: number[] | null = null;
      const fillPaintOps = new Set([
        OPS.fill,
        OPS.eoFill,
        OPS.fillStroke,
        OPS.eoFillStroke,
        OPS.closeFillStroke,
        OPS.closeEOFillStroke,
      ]);
      const pushRect = (minMax: number[]) => {
        const [minX, minY, maxX, maxY] = minMax;
        const a = transformPoint(ctm, minX, minY);
        const b = transformPoint(ctm, maxX, maxY);
        rectangles.push({
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(b.x - a.x),
          height: Math.abs(b.y - a.y),
          color: fill,
          page: pageNumber,
        });
      };
      for (let index = 0; index < operators.fnArray.length; index += 1) {
        const op = operators.fnArray[index];
        const args = operators.argsArray[index] as unknown[];
        if (op === OPS.save) stack.push([...ctm] as Matrix);
        else if (op === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (op === OPS.transform) ctm = multiply(ctm, args.map(Number) as Matrix);
        else if (op === OPS.setFillRGBColor) fill = colorHex(args);
        else if (op === OPS.setFillGray) fill = colorHex([args[0], args[0], args[0]]);
        else if (op === OPS.constructPath) {
          // pdf.js folds a simple "build path, then immediately paint it" sequence into a single
          // constructPath call: args[0] carries the actual paint opcode (fill/stroke/clip/endPath)
          // and args[2] is the path's axis-aligned bounding box, already computed for us.
          const paintOp = args[0] as number;
          const minMax = args[2] as number[] | undefined;
          if (!minMax || minMax.length !== 4) {
            pendingMinMax = null;
          } else if (fillPaintOps.has(paintOp)) {
            pushRect(minMax);
            pendingMinMax = null;
          } else {
            // Clip-only or stroke-only paths: keep the bounding box in case a following
            // standalone paint operator (older/unoptimized operator lists) references it.
            pendingMinMax = minMax;
          }
        } else if (fillPaintOps.has(op) && pendingMinMax) {
          pushRect(pendingMinMax);
          pendingMinMax = null;
        } else if (op === OPS.endPath || op === OPS.stroke || op === OPS.clip || op === OPS.eoClip) {
          pendingMinMax = null;
        }
      }
    }
    const result = { ...matchVectorCalendarStructure(texts, rectangles), durationMs: Date.now() - startedAt };
    console.info("AI calendar assignment transformation", {
      stage: "vector_extraction",
      vectorAssignmentDigest: await computeDatedScheduleAssignmentDigest(result.assignments),
      assignmentCount: result.assignments.length,
    });
    return result;
  } finally {
    await document.destroy();
  }
}
