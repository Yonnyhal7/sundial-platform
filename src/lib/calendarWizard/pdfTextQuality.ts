export type CalendarTextQualityReasonCode =
  | "no_text_layer"
  | "extracted_text_too_short"
  | "unreadable_characters"
  | "insufficient_date_signals"
  | "likely_scanned_pdf"
  | "likely_visual_calendar_grid"
  | "likely_color_legend_dependency"
  | "text_usable";

export type CalendarTextQuality = {
  usable: boolean;
  score: number;
  reasonCodes: CalendarTextQualityReasonCode[];
  likelyVisualLayoutDependency: boolean;
  extractedCharacterCount: number;
  extractedLineCount: number;
};

const MONTH_PATTERN =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/gi;
const WEEKDAY_PATTERN = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri)\b/gi;
const DATE_PATTERN = /\b(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/g;
const YEAR_RANGE_PATTERN = /\b20\d{2}\s*[-–]\s*(?:20)?\d{2}\b/g;
const CALENDAR_TERM_PATTERN =
  /\b(holiday|no school|minimum day|rally|finals?|semester|instruction begins?|brown day|gold day|break|teacher work|inservice|testing|early release|schedule)\b/gi;
const VISUAL_PATTERN =
  /\b(color|legend|shading|shaded|highlighted|circle|icon|symbol|gray|grey|blue|green|red|orange|purple)\b/gi;

function countMatches(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].length;
}

export function evaluateCalendarTextQuality({
  text,
  pageCount,
}: {
  text: string;
  pageCount: number;
}): CalendarTextQuality {
  const normalizedText = text || "";
  const extractedCharacterCount = normalizedText.replace(/\s/g, "").length;
  const lines = normalizedText.split("\n").filter((line) => line.trim());
  const extractedLineCount = lines.length;
  const replacementCount = countMatches(normalizedText, /\uFFFD/g);
  const unprintableCount = countMatches(normalizedText, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g);
  const monthCount = countMatches(normalizedText, MONTH_PATTERN);
  const weekdayCount = countMatches(normalizedText, WEEKDAY_PATTERN);
  const dateCount = countMatches(normalizedText, DATE_PATTERN);
  const yearRangeCount = countMatches(normalizedText, YEAR_RANGE_PATTERN);
  const calendarTermCount = countMatches(normalizedText, CALENDAR_TERM_PATTERN);
  const visualSignalCount = countMatches(normalizedText, VISUAL_PATTERN);
  const reasonCodes: CalendarTextQualityReasonCode[] = [];
  let score = 0;

  if (extractedCharacterCount === 0) {
    reasonCodes.push("no_text_layer", "likely_scanned_pdf");
  }
  if (extractedCharacterCount < 900) {
    reasonCodes.push("extracted_text_too_short");
  }

  const unreadableRatio =
    extractedCharacterCount > 0
      ? (replacementCount + unprintableCount) / extractedCharacterCount
      : 1;
  if (unreadableRatio > 0.015) {
    reasonCodes.push("unreadable_characters");
  }

  if (monthCount < 4 && dateCount < 10 && yearRangeCount === 0) {
    reasonCodes.push("insufficient_date_signals");
  }

  const lineDensity = pageCount > 0 ? extractedLineCount / pageCount : extractedLineCount;
  const likelyVisualLayoutDependency =
    visualSignalCount >= 5 ||
    (monthCount >= 8 && dateCount < 8 && lineDensity < 26) ||
    /\b(brown|gold)\b/i.test(normalizedText) && visualSignalCount >= 2;

  if (likelyVisualLayoutDependency) {
    reasonCodes.push(
      visualSignalCount >= 5
        ? "likely_color_legend_dependency"
        : "likely_visual_calendar_grid"
    );
  }

  score += Math.min(25, extractedCharacterCount / 120);
  score += Math.min(20, extractedLineCount / 2);
  score += Math.min(20, monthCount * 2.5 + dateCount * 0.7 + yearRangeCount * 6);
  score += Math.min(18, weekdayCount * 1.2);
  score += Math.min(17, calendarTermCount * 2);
  score -= Math.min(30, unreadableRatio * 1000);
  if (likelyVisualLayoutDependency) score -= 22;
  if (reasonCodes.includes("extracted_text_too_short")) score -= 18;

  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const usable =
    safeScore >= 62 &&
    !reasonCodes.includes("no_text_layer") &&
    !reasonCodes.includes("likely_scanned_pdf") &&
    !reasonCodes.includes("unreadable_characters") &&
    !reasonCodes.includes("insufficient_date_signals") &&
    !likelyVisualLayoutDependency;

  return {
    usable,
    score: safeScore,
    reasonCodes: usable ? ["text_usable"] : [...new Set(reasonCodes)],
    likelyVisualLayoutDependency,
    extractedCharacterCount,
    extractedLineCount,
  };
}
