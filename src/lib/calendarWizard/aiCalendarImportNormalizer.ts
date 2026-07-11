import {
  compareDateStrings,
  isDateString,
} from "./dateUtils";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import { normalizeScheduleNameForMatching } from "./aiScheduleMatching";
import {
  validateAiCalendarImportResult,
  type AiCalendarImportResult,
  type AiDetectedScheduleCategory,
  type AiImportConfidence,
  type AiImportEvidence,
  type AiImportWarning,
} from "./aiImportTypes";
import type { CalendarWizardConfig, PatternType, Weekday } from "./types";

export type RawAiCalendarExtraction = {
  documentTitle: string | null;
  detectedSchoolName: string | null;
  schoolYearLabel: string | null;
  firstInstructionalDate: string;
  lastInstructionalDate: string;
  operatingWeekdays: Weekday[];
  expectedInstructionalDayCount: number | null;
  schoolYearConfidence: AiImportConfidence;
  detectedSchedules: Array<{
    tempId: string;
    name: string;
    category: AiDetectedScheduleCategory;
    confidence: AiImportConfidence;
    evidence: RawEvidence | null;
  }>;
  normalPattern: {
    type: PatternType;
    scheduleTempIds: string[];
    weekdayMappings: Array<{ weekday: Weekday; scheduleTempId: string }>;
    confidence: AiImportConfidence;
    evidence: RawEvidence | null;
  };
  noSchoolRanges: Array<{
    id: string;
    startDate: string;
    endDate: string | null;
    label: string;
    type: string | null;
    confidence: AiImportConfidence;
    evidence: RawEvidence | null;
  }>;
  specialSchoolDays: Array<{
    id: string;
    startDate: string;
    endDate: string | null;
    label: string;
    type: string | null;
    scheduleTempId: string | null;
    isInstructional: boolean;
    confidence: AiImportConfidence;
    evidence: RawEvidence | null;
  }>;
  informationalDates: Array<{
    id: string;
    date: string;
    label: string;
    confidence: AiImportConfidence;
    evidence: RawEvidence | null;
  }>;
  legendInterpretation: string | null;
  extractionNotes: string | null;
  warnings: AiImportWarning[];
};

type RawEvidence = {
  sourceText: string | null;
  page: number | null;
  explanation: string | null;
};

export type NormalizeAiCalendarImportOptions = {
  source: "mock" | "openai";
  analyzedAt?: string;
  usage?: AiCalendarImportResult["usage"];
};

export type NormalizeAiCalendarImportResult =
  | { success: true; importResult: AiCalendarImportResult }
  | { success: false; errors: string[] };

function trimOptional(value: string | null | undefined) {
  const next = (value || "").trim();
  return next || null;
}

function trimRequired(value: string, fallback: string) {
  return value.trim() || fallback;
}

function evidence(raw: RawEvidence | null): AiImportEvidence | undefined {
  if (!raw) return undefined;
  const sourceText = trimOptional(raw.sourceText) || undefined;
  const explanation = trimOptional(raw.explanation) || undefined;
  const page = typeof raw.page === "number" && raw.page > 0 ? raw.page : undefined;
  if (!sourceText && !explanation && !page) return undefined;
  return { sourceText, explanation, page };
}

function dedupeByKey<T>(items: T[], key: (item: T) => string, warnings: AiImportWarning[]) {
  const seen = new Set<string>();
  const next: T[] = [];

  for (const item of items) {
    const itemKey = key(item);
    if (seen.has(itemKey)) {
      warnings.push({
        code: "duplicate_import_item_removed",
        severity: "review",
        message: "Sundial removed an exact duplicate item from the AI import.",
      });
      continue;
    }
    seen.add(itemKey);
    next.push(item);
  }

  return next;
}

function dateRangeKey(item: { startDate: string; endDate?: string; label: string }) {
  return `${item.startDate}|${item.endDate || ""}|${item.label.toLowerCase()}`;
}

function makeId(prefix: string, value: string, index: number) {
  return `${prefix}-${normalizeScheduleNameForMatching(value).replace(/\s+/g, "-") || index}`;
}

function validateReferences(
  raw: RawAiCalendarExtraction,
  warnings: AiImportWarning[]
) {
  const scheduleIds = new Set(raw.detectedSchedules.map((schedule) => schedule.tempId));

  for (const tempId of raw.normalPattern.scheduleTempIds) {
    if (!scheduleIds.has(tempId)) {
      warnings.push({
        code: "unknown_pattern_schedule_reference",
        severity: "review",
        message: `The PDF referenced a normal pattern schedule that was not listed: ${tempId}.`,
      });
    }
  }

  for (const day of raw.specialSchoolDays) {
    if (day.scheduleTempId && !scheduleIds.has(day.scheduleTempId)) {
      warnings.push({
        code: "unknown_special_day_schedule_reference",
        severity: "review",
        message: `A special day referenced an unknown schedule: ${day.scheduleTempId}.`,
      });
    }
  }
}

function addDateWarnings(importResult: AiCalendarImportResult, warnings: AiImportWarning[]) {
  if (
    isDateString(importResult.schoolYear.startDate) &&
    isDateString(importResult.schoolYear.endDate) &&
    compareDateStrings(importResult.schoolYear.startDate, importResult.schoolYear.endDate) > 0
  ) {
    warnings.push({
      code: "school_year_dates_reversed",
      severity: "blocking",
      message: "The first instructional date appears after the last instructional date.",
    });
  }

  for (const specialDay of importResult.specialDays) {
    if (
      isDateString(importResult.schoolYear.startDate) &&
      isDateString(importResult.schoolYear.endDate) &&
      isDateString(specialDay.startDate) &&
      (compareDateStrings(specialDay.startDate, importResult.schoolYear.startDate) < 0 ||
        compareDateStrings(specialDay.startDate, importResult.schoolYear.endDate) > 0)
    ) {
      warnings.push({
        code: "special_day_outside_school_year",
        severity: "review",
        message: `${specialDay.label} falls outside the detected school year.`,
      });
    }
  }
}

function addInstructionalDayCountWarning(importResult: AiCalendarImportResult, warnings: AiImportWarning[]) {
  const expected = importResult.expectedInstructionalDayCount;
  if (!expected || !isDateString(importResult.schoolYear.startDate) || !isDateString(importResult.schoolYear.endDate)) {
    return;
  }

  const config: CalendarWizardConfig = {
    schoolYear: {
      name: importResult.schoolYear.label,
      startDate: importResult.schoolYear.startDate,
      endDate: importResult.schoolYear.endDate,
    },
    operatingWeekdays: importResult.schoolYear.operatingWeekdays,
    pattern: {
      type: "same",
      scheduleId: "ai-verification-schedule",
    },
    noSchoolRanges: importResult.noSchoolRanges,
    specialDays: importResult.specialDays.map((day) => ({
      ...day,
      scheduleId: day.isInstructional ? "ai-verification-schedule" : null,
    })),
    informationalDates: importResult.informationalDates,
  };
  const generated = generateSchoolYearCalendar(config);

  if (generated.summary.instructionalDayCount !== expected) {
    warnings.push({
      code: "instructional_day_count_mismatch",
      severity: "review",
      message: `The PDF lists ${expected} instructional days, but the imported rules currently produce ${generated.summary.instructionalDayCount}. Please review highlighted dates.`,
    });
  }
}

export function normalizeAiCalendarExtraction(
  raw: RawAiCalendarExtraction,
  options: NormalizeAiCalendarImportOptions
): NormalizeAiCalendarImportResult {
  const warnings = [...(raw.warnings || [])];
  validateReferences(raw, warnings);

  const noSchoolRanges = dedupeByKey(
    raw.noSchoolRanges.map((range, index) => ({
      id: trimRequired(range.id, makeId("ai-no-school", range.label, index)),
      startDate: range.startDate,
      endDate: range.endDate || undefined,
      label: trimRequired(range.label, "No School"),
      type: trimOptional(range.type) || undefined,
      confidence: range.confidence,
      evidence: evidence(range.evidence),
    })),
    dateRangeKey,
    warnings
  ).sort((a, b) => compareDateStrings(a.startDate, b.startDate));

  const specialDays = dedupeByKey(
    raw.specialSchoolDays.map((day, index) => ({
      id: trimRequired(day.id, makeId("ai-special", day.label, index)),
      startDate: day.startDate,
      endDate: day.endDate || undefined,
      label: trimRequired(day.label, "Special Day"),
      type: trimOptional(day.type) || undefined,
      scheduleTempId: trimOptional(day.scheduleTempId) || undefined,
      isInstructional: day.isInstructional,
      confidence: day.confidence,
      evidence: evidence(day.evidence),
    })),
    dateRangeKey,
    warnings
  ).sort((a, b) => compareDateStrings(a.startDate, b.startDate));

  const informationalDates = dedupeByKey(
    raw.informationalDates.map((date, index) => ({
      id: trimRequired(date.id, makeId("ai-info", date.label, index)),
      date: date.date,
      label: trimRequired(date.label, "Important Date"),
      confidence: date.confidence,
      evidence: evidence(date.evidence),
    })),
    (date) => `${date.date}|${date.label.toLowerCase()}`,
    warnings
  ).sort((a, b) => compareDateStrings(a.date, b.date));

  const detectedSchedules = raw.detectedSchedules.map((schedule, index) => {
    const detectedName = trimRequired(schedule.name, `Detected Schedule ${index + 1}`);
    return {
      tempId: trimRequired(schedule.tempId, makeId("ai-schedule", detectedName, index)),
      detectedName,
      normalizedName: normalizeScheduleNameForMatching(detectedName),
      category: schedule.category,
      confidence: schedule.confidence,
      evidence: evidence(schedule.evidence),
      needsSetup: true,
    };
  });

  const importResult: AiCalendarImportResult = {
    schemaVersion: 1,
    source: options.source,
    analyzedAt: options.analyzedAt || new Date().toISOString().slice(0, 10),
    documentTitle: trimOptional(raw.documentTitle),
    detectedSchoolName: trimOptional(raw.detectedSchoolName),
    expectedInstructionalDayCount: raw.expectedInstructionalDayCount,
    legendInterpretation: trimOptional(raw.legendInterpretation),
    extractionNotes: trimOptional(raw.extractionNotes),
    usage: options.usage,
    schoolYear: {
      label: trimOptional(raw.schoolYearLabel) || undefined,
      startDate: raw.firstInstructionalDate,
      endDate: raw.lastInstructionalDate,
      operatingWeekdays: raw.operatingWeekdays,
      confidence: raw.schoolYearConfidence,
    },
    detectedSchedules,
    pattern: {
      type: raw.normalPattern.type,
      scheduleTempIds: raw.normalPattern.scheduleTempIds.filter((tempId) =>
        detectedSchedules.some((schedule) => schedule.tempId === tempId)
      ),
      confidence: raw.normalPattern.confidence,
      evidence: evidence(raw.normalPattern.evidence),
    },
    noSchoolRanges,
    specialDays,
    informationalDates,
    warnings,
  };

  addDateWarnings(importResult, warnings);
  addInstructionalDayCountWarning(importResult, warnings);

  const validation = validateAiCalendarImportResult(importResult);
  if (!validation.success) return validation;

  return { success: true, importResult: validation.data };
}
