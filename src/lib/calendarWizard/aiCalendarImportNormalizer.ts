import {
  addDays,
  compareDateStrings,
  eachDateInRange,
  formatDateString,
  isDateString,
} from "./dateUtils";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import { normalizeScheduleNameForMatching } from "./aiScheduleMatching";
import {
  validateAiCalendarImportResult,
  type AiCalendarPageClassification,
  type AiCalendarPageRole,
  type AiCalendarImportResult,
  type AiDetectedScheduleCategory,
  type AiDetectedNoSchoolRange,
  type AiDetectedInformationalDate,
  type AiImportAutomaticResolution,
  type AiImportConfidence,
  type AiImportEvidence,
  type AiImportValidationResult,
  type AiImportWarning,
} from "./aiImportTypes";
import type { PatternType, Weekday } from "./types";
import { getLocalTodayISO } from "@/lib/localDate";
import { buildAiPreviewConfig } from "./aiImportPreview";
import { initializeInstructionalDayCountReview } from "./instructionalDayCountReview";

export type RawAiCalendarExtraction = {
  documentTitle: string | null;
  detectedSchoolName: string | null;
  schoolYearLabel: string | null;
  calendarCoverageStart?: string | null;
  calendarCoverageEnd?: string | null;
  firstInstructionalDate: string;
  lastInstructionalDate: string;
  operatingWeekdays: Weekday[];
  expectedInstructionalDayCount: number | null;
  schoolYearConfidence: AiImportConfidence;
  pageClassifications: Array<{
    page: number;
    role: AiCalendarPageRole;
    confidence: AiImportConfidence;
    evidence: RawEvidence | null;
  }>;
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
  | Extract<AiImportValidationResult, { success: false }>;

function trimOptional(value: string | null | undefined) {
  const next = (value || "").trim();
  return next || null;
}

function trimRequired(value: string, fallback: string) {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function evidence(raw: RawEvidence | null): AiImportEvidence | undefined {
  if (!raw) return undefined;
  const sourceText = trimOptional(raw.sourceText) || undefined;
  const explanation = trimOptional(raw.explanation) || undefined;
  const page = typeof raw.page === "number" && raw.page > 0 ? raw.page : undefined;
  if (!sourceText && !explanation && !page) return undefined;
  return { sourceText, explanation, page };
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return allowed.find((item) => item.toLowerCase() === normalized) || fallback;
}

/** Coerces only known, safe representation differences. It never supplies required dates or schedules. */
function normalizeRawContract(value: unknown): RawAiCalendarExtraction {
  const raw = asRecord(value);
  const pattern = asRecord(raw.normalPattern);
  const normalizeEvidence = (value: unknown) => {
    if (value == null) return null;
    const item = asRecord(value);
    return {
      sourceText: typeof item.sourceText === "string" ? item.sourceText : null,
      page: normalizeInteger(item.page),
      explanation: typeof item.explanation === "string" ? item.explanation : null,
    };
  };
  const records = (value: unknown) => (Array.isArray(value) ? value.map(asRecord) : []);

  return {
    documentTitle: typeof raw.documentTitle === "string" ? raw.documentTitle : null,
    detectedSchoolName: typeof raw.detectedSchoolName === "string" ? raw.detectedSchoolName : null,
    schoolYearLabel: typeof raw.schoolYearLabel === "string" ? raw.schoolYearLabel : null,
    calendarCoverageStart: typeof raw.calendarCoverageStart === "string" ? raw.calendarCoverageStart : null,
    calendarCoverageEnd: typeof raw.calendarCoverageEnd === "string" ? raw.calendarCoverageEnd : null,
    firstInstructionalDate: typeof raw.firstInstructionalDate === "string" ? raw.firstInstructionalDate : "",
    lastInstructionalDate: typeof raw.lastInstructionalDate === "string" ? raw.lastInstructionalDate : "",
    operatingWeekdays: normalizeWeekdays(raw.operatingWeekdays),
    expectedInstructionalDayCount: normalizeInteger(raw.expectedInstructionalDayCount),
    schoolYearConfidence: normalizeConfidence(raw.schoolYearConfidence),
    pageClassifications: records(raw.pageClassifications).map((item) => ({
      page: normalizeInteger(item.page) || 0,
      role: enumValue(
        item.role,
        [
          "student_attendance_calendar",
          "school_schedule_calendar",
          "personnel_holidays",
          "staff_calendar",
          "informational_appendix",
          "unrelated",
        ] as const,
        "unrelated"
      ),
      confidence: normalizeConfidence(item.confidence),
      evidence: normalizeEvidence(item.evidence),
    })),
    detectedSchedules: records(raw.detectedSchedules).map((item) => ({
      tempId: typeof item.tempId === "string" ? item.tempId : "",
      name: typeof item.name === "string" ? item.name : "",
      category: enumValue(item.category, ["regular", "rotation", "special", "finals", "minimum", "testing", "unknown"] as const, "unknown"),
      confidence: normalizeConfidence(item.confidence),
      evidence: normalizeEvidence(item.evidence),
    })),
    normalPattern: {
      type: enumValue(pattern.type, ["same", "repeating", "weekday"] as const, "same"),
      scheduleTempIds: Array.isArray(pattern.scheduleTempIds) ? pattern.scheduleTempIds.filter((item): item is string => typeof item === "string").map((item) => item.trim()) : [],
      weekdayMappings: [],
      confidence: normalizeConfidence(pattern.confidence),
      evidence: normalizeEvidence(pattern.evidence),
    },
    noSchoolRanges: records(raw.noSchoolRanges).map((item) => ({
      id: typeof item.id === "string" ? item.id : "", startDate: typeof item.startDate === "string" ? item.startDate : "", endDate: typeof item.endDate === "string" ? item.endDate : null, label: typeof item.label === "string" ? item.label : "", type: typeof item.type === "string" ? item.type : null, confidence: normalizeConfidence(item.confidence), evidence: normalizeEvidence(item.evidence),
    })),
    specialSchoolDays: records(raw.specialSchoolDays).map((item) => ({
      id: typeof item.id === "string" ? item.id : "", startDate: typeof item.startDate === "string" ? item.startDate : "", endDate: typeof item.endDate === "string" ? item.endDate : null, label: typeof item.label === "string" ? item.label : "", type: typeof item.type === "string" ? item.type : null, scheduleTempId: typeof item.scheduleTempId === "string" ? item.scheduleTempId.trim() : null, isInstructional: item.isInstructional === true, confidence: normalizeConfidence(item.confidence), evidence: normalizeEvidence(item.evidence),
    })),
    informationalDates: records(raw.informationalDates).map((item) => ({
      id: typeof item.id === "string" ? item.id : "", date: typeof item.date === "string" ? item.date : "", label: typeof item.label === "string" ? item.label : "", confidence: normalizeConfidence(item.confidence), evidence: normalizeEvidence(item.evidence),
    })),
    legendInterpretation: typeof raw.legendInterpretation === "string" ? raw.legendInterpretation : null,
    extractionNotes: typeof raw.extractionNotes === "string" ? raw.extractionNotes : null,
    warnings: records(raw.warnings).map((item) => ({ code: typeof item.code === "string" ? item.code.trim() : "ai_import_review", message: typeof item.message === "string" ? item.message.trim() : "Review this imported item.", severity: enumValue(item.severity, ["info", "review", "blocking"] as const, "review") })),
  };
}

function normalizeConfidence(value: unknown): AiImportConfidence {
  return value === "high" || value === "review" || value === "uncertain"
    ? value
    : "review";
}

function normalizeWeekday(value: unknown): Weekday | null {
  const next = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof next === "number" && Number.isInteger(next) && next >= 0 && next <= 6
    ? (next as Weekday)
    : null;
}

function normalizeWeekdays(values: unknown): Weekday[] {
  return asArray(values as unknown[])
    .map(normalizeWeekday)
    .filter((weekday): weekday is Weekday => weekday !== null);
}

function normalizeDateValue(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const normalized = formatDateString(parsed);
    return normalized.endsWith(
      `${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`
    )
      ? normalized
      : trimmed;
  }

  const isoWithTime = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoWithTime && isDateString(isoWithTime[1])) return isoWithTime[1];

  return trimmed;
}

function normalizeInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
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

function normalizeRangeEnd(startDate: string, endDate: string | null | undefined) {
  return endDate || startDate;
}

function dateRangeKey(item: { startDate: string; endDate: string; label: string }) {
  return `${item.startDate}|${item.endDate || ""}|${item.label.toLowerCase()}`;
}

function isExplicitNoSchoolLabel(value: string) {
  return /\b(no school|no classes|non[-\s]?student|student[-\s]?free|holiday|holidays|recess|break|closed|closure|district closed|inservice|teacher work|staff development)\b/i.test(
    value
  );
}

function isTermEndingLabel(value: string) {
  return /\b((fall|spring|winter)?\s*(term|quarter|semester)\s+ends?|last instructional day)\b/i.test(
    value
  );
}

function shouldReclassifyNoSchoolAsInformational(range: {
  label: string;
  type?: string;
}) {
  const labelText = `${range.label || ""} ${range.type || ""}`.trim();
  return isTermEndingLabel(labelText) && !isExplicitNoSchoolLabel(labelText);
}

function isRallyScheduleException(value: string) {
  return /\brally\b/i.test(value) && !/\b(no school|no classes|cancelled|canceled)\b/i.test(value);
}

function isNestedHolidayLabel(value: string) {
  return /\b(admission day|holiday|holidays|christmas|new year(?:'s)? day)\b/i.test(value) &&
    !/\b(rally|finals?|minimum day|testing|instruction)\b/i.test(value);
}

function canonicalCoverageLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function reconcileNestedNoSchoolCoverage({
  ranges,
  specialDays,
  informationalDates,
  automaticResolutions,
}: {
  ranges: AiDetectedNoSchoolRange[];
  specialDays: Array<{
    id: string;
    startDate: string;
    endDate: string;
    label: string;
    type?: string;
    scheduleTempId?: string;
    isInstructional: boolean;
    confidence: AiImportConfidence;
    evidence?: AiImportEvidence;
  }>;
  informationalDates: AiDetectedInformationalDate[];
  automaticResolutions: AiImportAutomaticResolution[];
}) {
  const nextRanges = [...ranges]
    .map((range) => ({ ...range }))
    .sort((left, right) => compareDateStrings(left.startDate, right.startDate));
  const nestedSpecialIds = new Set<string>();
  const preservedDates = [...informationalDates];

  for (let index = 0; index < nextRanges.length - 1; index += 1) {
    const current = nextRanges[index];
    const next = nextRanges[index + 1];
    if (canonicalCoverageLabel(current.label) !== canonicalCoverageLabel(next.label)) continue;
    const gapStart = addDays(current.endDate, 1);
    const gapEnd = addDays(next.startDate, -1);
    if (compareDateStrings(gapStart, gapEnd) > 0) continue;
    const gapDates = eachDateInRange(gapStart, gapEnd);
    const nestedSpecials = specialDays.filter(
      (day) =>
        isNestedHolidayLabel(`${day.label} ${day.type || ""}`) &&
        gapDates.every((date) => date >= day.startDate && date <= day.endDate)
    );
    const gapIsLabeled = gapDates.every((date) =>
      nestedSpecials.some((day) => date >= day.startDate && date <= day.endDate) ||
      informationalDates.some((item) => item.date === date && isNestedHolidayLabel(item.label))
    );
    if (!gapIsLabeled) continue;

    current.endDate = next.endDate;
    nextRanges.splice(index + 1, 1);
    index -= 1;
    for (const day of nestedSpecials) {
      nestedSpecialIds.add(day.id);
      for (const date of eachDateInRange(day.startDate, day.endDate)) {
        preservedDates.push({
          id: `${day.id}-nested-${date}`,
          date,
          label: day.label,
          confidence: day.confidence,
          evidence: day.evidence,
        });
      }
    }
    pushUniqueResolution(automaticResolutions, {
      code: "informational_label_preserved",
      title: "Nested no-school label preserved",
      message: `${nestedSpecials.map((day) => day.label).join(", ") || "A named holiday"} occurs during ${current.label}. Sundial kept one continuous no-school range and preserved the nested label.`,
      dateRange: { startDate: current.startDate, endDate: current.endDate },
      labelsPreserved: [current.label, ...nestedSpecials.map((day) => day.label)],
      originalIds: [current.id, next.id, ...nestedSpecials.map((day) => day.id)],
    });
  }

  for (const day of specialDays) {
    if (nestedSpecialIds.has(day.id) || !isNestedHolidayLabel(`${day.label} ${day.type || ""}`)) {
      continue;
    }
    const containingRange = nextRanges.find(
      (range) => day.startDate >= range.startDate && day.endDate <= range.endDate
    );
    if (!containingRange) continue;
    nestedSpecialIds.add(day.id);
    for (const date of eachDateInRange(day.startDate, day.endDate)) {
      preservedDates.push({
        id: `${day.id}-nested-${date}`,
        date,
        label: day.label,
        confidence: day.confidence,
        evidence: day.evidence,
      });
    }
    pushUniqueResolution(automaticResolutions, {
      code: "informational_label_preserved",
      title: "Nested no-school label preserved",
      message: `${day.label} occurs during ${containingRange.label}. Sundial kept the date as no school and preserved both labels.`,
      dateRange: { startDate: day.startDate, endDate: day.endDate },
      labelsPreserved: [containingRange.label, day.label],
      originalIds: [containingRange.id, day.id],
    });
  }

  return {
    ranges: nextRanges,
    specialDays: specialDays.filter((day) => !nestedSpecialIds.has(day.id)),
    informationalDates: preservedDates,
  };
}

function pushUniqueResolution(
  resolutions: AiImportAutomaticResolution[],
  resolution: AiImportAutomaticResolution
) {
  const key = [
    resolution.code,
    resolution.dateRange?.startDate,
    resolution.dateRange?.endDate,
    resolution.labelsPreserved?.join("|"),
  ].join("::");

  if (
    resolutions.some(
      (item) =>
        [
          item.code,
          item.dateRange?.startDate,
          item.dateRange?.endDate,
          item.labelsPreserved?.join("|"),
        ].join("::") === key
    )
  ) {
    return;
  }

  resolutions.push(resolution);
}

function mergeNoSchoolCoverage(
  ranges: AiDetectedNoSchoolRange[],
  automaticResolutions: AiImportAutomaticResolution[],
  preservedInformationalDates: AiDetectedInformationalDate[]
) {
  const sorted = [...ranges].sort((a, b) => {
    const startComparison = compareDateStrings(a.startDate, b.startDate);
    if (startComparison !== 0) return startComparison;
    return compareDateStrings(a.endDate, b.endDate);
  });
  const merged: Array<{
    range: AiDetectedNoSchoolRange;
    labels: string[];
    ids: string[];
    merged: boolean;
  }> = [];

  for (const range of sorted) {
    const current = merged[merged.length - 1];

    if (
      current &&
      isDateString(current.range.startDate) &&
      isDateString(current.range.endDate) &&
      isDateString(range.startDate) &&
      isDateString(range.endDate) &&
      compareDateStrings(range.startDate, addDays(current.range.endDate, 1)) <= 0
    ) {
      const nextEndDate =
        compareDateStrings(range.endDate, current.range.endDate) > 0
          ? range.endDate
          : current.range.endDate;

      current.range.endDate = nextEndDate;
      current.range.evidence = current.range.evidence || range.evidence;
      current.merged = true;
      if (!current.labels.includes(range.label)) {
        current.labels.push(range.label);
      }
      if (!current.ids.includes(range.id)) {
        current.ids.push(range.id);
      }
      for (const date of eachDateInRange(range.startDate, range.endDate)) {
        preservedInformationalDates.push({
          id: `${range.id}-annotation-${date}`,
          date,
          label: range.label,
          confidence: range.confidence,
          evidence: range.evidence,
        });
      }
      continue;
    }

    merged.push({
      range: { ...range },
      labels: [range.label],
      ids: [range.id],
      merged: false,
    });
  }

  for (const group of merged) {
    if (!group.merged) continue;
    pushUniqueResolution(automaticResolutions, {
      code: "no_school_ranges_merged",
      title: "No-school ranges combined",
      message: `${group.range.label} contains or overlaps ${group.labels.length - 1} named ${
        group.labels.length === 2 ? "holiday" : "holidays"
      }. Sundial combined the no-school dates and preserved the labels.`,
      dateRange: {
        startDate: group.range.startDate,
        endDate: group.range.endDate,
      },
      labelsPreserved: group.labels,
      originalIds: group.ids,
    });
  }

  return merged.map((group) => group.range);
}

const studentCalendarPageRoles = new Set<AiCalendarPageRole>([
  "student_attendance_calendar",
  "school_schedule_calendar",
]);

const outOfScopePageRoles = new Set<AiCalendarPageRole>([
  "personnel_holidays",
  "staff_calendar",
  "informational_appendix",
  "unrelated",
]);

function normalizePageClassifications(
  classifications: RawAiCalendarExtraction["pageClassifications"]
): AiCalendarPageClassification[] {
  const byPage = new Map<number, AiCalendarPageClassification>();
  for (const classification of classifications) {
    if (!classification.page || classification.page < 1) continue;
    byPage.set(classification.page, {
      page: classification.page,
      role: classification.role,
      confidence: normalizeConfidence(classification.confidence),
      evidence: evidence(classification.evidence),
    });
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page);
}

function pageRoleMap(classifications: AiCalendarPageClassification[]) {
  return new Map(classifications.map((classification) => [
    classification.page,
    classification.role,
  ]));
}

function isOutOfScopeEvidence(
  evidence: RawEvidence | null,
  rolesByPage: Map<number, AiCalendarPageRole>
) {
  if (!evidence?.page) return false;
  const role = rolesByPage.get(evidence.page);
  return Boolean(role && outOfScopePageRoles.has(role));
}

function filterOutOfScopeItems<T extends { evidence: RawEvidence | null }>(
  items: T[],
  rolesByPage: Map<number, AiCalendarPageRole>,
  warnings: AiImportWarning[],
  itemType: string
) {
  const next: T[] = [];
  let removedCount = 0;
  for (const item of items) {
    if (isOutOfScopeEvidence(item.evidence, rolesByPage)) {
      removedCount += 1;
      continue;
    }
    next.push(item);
  }

  if (removedCount > 0) {
    warnings.push({
      code: "out_of_scope_page_dates_removed",
      severity: "review",
      message: `Sundial ignored ${removedCount} ${itemType} ${
        removedCount === 1 ? "item" : "items"
      } from staff, personnel, appendix, or unrelated pages.`,
    });
  }

  return next;
}

function makeId(prefix: string, value: string, index: number) {
  return `${prefix}-${normalizeScheduleNameForMatching(value).replace(/\s+/g, "-") || index}`;
}

function scheduleNameFromTempId(tempId: string) {
  const cleaned = tempId
    .replace(/^(ai-|sched-|schedule-|temp-)+/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return cleaned
    ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Referenced Schedule";
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
        severity: "blocking",
        message: `${specialDay.label} falls outside the detected school year.`,
      });
    }
  }
}

export function normalizeAiCalendarExtraction(
  input: RawAiCalendarExtraction,
  options: NormalizeAiCalendarImportOptions
): NormalizeAiCalendarImportResult {
  const raw = normalizeRawContract(input);
  const rawDetectedSchedules = asArray(raw.detectedSchedules);
  const rawNormalPattern = raw.normalPattern || {
    type: "same" as const,
    scheduleTempIds: [],
    weekdayMappings: [],
    confidence: "review" as const,
    evidence: null,
  };
  const warnings = asArray(raw.warnings);
  const pageClassifications = normalizePageClassifications(raw.pageClassifications);
  const rolesByPage = pageRoleMap(pageClassifications);
  if (
    pageClassifications.length > 0 &&
    !pageClassifications.some((classification) =>
      studentCalendarPageRoles.has(classification.role)
    )
  ) {
    warnings.push({
      code: "no_student_calendar_page_identified",
      severity: "review",
      message:
        "Sundial could not confidently identify a student calendar page. Review imported dates before creating the calendar.",
    });
  }
  const rawNoSchoolRanges = filterOutOfScopeItems(
    asArray(raw.noSchoolRanges),
    rolesByPage,
    warnings,
    "no-school"
  );
  const rawSpecialSchoolDays = filterOutOfScopeItems(
    asArray(raw.specialSchoolDays),
    rolesByPage,
    warnings,
    "special-day"
  );
  const rawInformationalDates = filterOutOfScopeItems(
    asArray(raw.informationalDates),
    rolesByPage,
    warnings,
    "informational"
  );
  validateReferences(
    {
      ...raw,
      detectedSchedules: rawDetectedSchedules,
      normalPattern: rawNormalPattern,
      noSchoolRanges: rawNoSchoolRanges,
      specialSchoolDays: rawSpecialSchoolDays,
      informationalDates: rawInformationalDates,
      warnings,
    },
    warnings
  );

  const automaticResolutions: AiImportAutomaticResolution[] = [];
  const preservedNoSchoolLabelDates: AiDetectedInformationalDate[] = [];
  const rallySchedule = rawDetectedSchedules.find((schedule) =>
    isRallyScheduleException(`${schedule.name} ${schedule.category}`)
  );
  const rallyNoSchoolIds = new Set(
    rawNoSchoolRanges
      .filter((range) => isRallyScheduleException(`${range.label} ${range.type || ""}`))
      .map((range) => range.id)
  );
  const reclassifiedRallySpecialDays = rawNoSchoolRanges
    .filter((range) => rallyNoSchoolIds.has(range.id))
    .map((range) => ({
      id: `${range.id}-instructional-rally`,
      startDate: range.startDate,
      endDate: range.endDate,
      label: range.label,
      type: range.type || "Rally",
      scheduleTempId: rallySchedule?.tempId || null,
      isInstructional: true,
      confidence: range.confidence,
      evidence: range.evidence,
    }));
  for (const rally of reclassifiedRallySpecialDays) {
    pushUniqueResolution(automaticResolutions, {
      code: "instructional_schedule_exception_reclassified",
      title: "Rally date kept instructional",
      message: `${rally.label} is a rally schedule exception, not a no-school day. Sundial kept it instructional and assigned the Rally schedule.`,
      dateRange: {
        startDate: normalizeDateValue(rally.startDate),
        endDate: normalizeRangeEnd(
          normalizeDateValue(rally.startDate),
          normalizeDateValue(rally.endDate)
        ),
      },
      labelsPreserved: [rally.label],
      originalIds: [rally.id],
    });
  }
  const normalizedNoSchoolCandidates = dedupeByKey(
    rawNoSchoolRanges.filter((range) => !rallyNoSchoolIds.has(range.id)).map((range, index) => ({
      id: trimRequired(range.id, makeId("ai-no-school", range.label, index)),
      startDate: normalizeDateValue(range.startDate),
      endDate: normalizeRangeEnd(
        normalizeDateValue(range.startDate),
        normalizeDateValue(range.endDate)
      ),
      label: trimRequired(range.label, "No School"),
      type: trimOptional(range.type) || undefined,
      confidence: normalizeConfidence(range.confidence),
      evidence: evidence(range.evidence),
    })),
    dateRangeKey,
    warnings
  );
  const reclassifiedInformationalDates: AiDetectedInformationalDate[] = [];
  let noSchoolRanges = mergeNoSchoolCoverage(
    normalizedNoSchoolCandidates.filter((range) => {
      if (!shouldReclassifyNoSchoolAsInformational(range)) {
        return true;
      }

      reclassifiedInformationalDates.push({
        id: `${range.id}-info`,
        date: range.startDate,
        label: range.label,
        confidence: range.confidence,
        evidence: range.evidence,
      });
      pushUniqueResolution(automaticResolutions, {
        code: "term_end_reclassified",
        title: "Term-ending date kept instructional",
        message: `${range.label} looks like an instructional term-ending date, not a no-school day. Sundial kept it as an informational calendar label.`,
        dateRange: {
          startDate: range.startDate,
          endDate: range.endDate,
        },
        labelsPreserved: [range.label],
        originalIds: [range.id],
      });
      return false;
    }),
    automaticResolutions,
    preservedNoSchoolLabelDates
  ).sort((a, b) => compareDateStrings(a.startDate, b.startDate));

  const normalizedSpecialDays = dedupeByKey(
    [...rawSpecialSchoolDays, ...reclassifiedRallySpecialDays].map((day, index) => ({
      id: trimRequired(day.id, makeId("ai-special", day.label, index)),
      startDate: normalizeDateValue(day.startDate),
      endDate: normalizeRangeEnd(
        normalizeDateValue(day.startDate),
        normalizeDateValue(day.endDate)
      ),
      label: trimRequired(day.label, "Special Day"),
      type: trimOptional(day.type) || undefined,
      scheduleTempId: trimOptional(day.scheduleTempId) || undefined,
      isInstructional: day.isInstructional,
      confidence: normalizeConfidence(day.confidence),
      evidence: evidence(day.evidence),
    })),
    dateRangeKey,
    warnings
  ).sort((a, b) => compareDateStrings(a.startDate, b.startDate));

  const specialNoSchoolRanges = normalizedSpecialDays
    .filter((day) => !day.isInstructional)
    .map((day) => ({
      id: `${day.id}-no-school`,
      startDate: day.startDate,
      endDate: day.endDate,
      label: day.label,
      type: day.type || "No School",
      confidence: day.confidence,
      evidence: day.evidence,
    }));
  if (specialNoSchoolRanges.length > 0) {
    noSchoolRanges = mergeNoSchoolCoverage(
      [...noSchoolRanges, ...specialNoSchoolRanges],
      automaticResolutions,
      preservedNoSchoolLabelDates
    ).sort((a, b) => compareDateStrings(a.startDate, b.startDate));
  }
  let specialDays: AiCalendarImportResult["specialDays"] = normalizedSpecialDays.filter(
    (day) => day.isInstructional
  );

  const normalizedRawInformationalDates = rawInformationalDates.map((date, index) => ({
    id: trimRequired(date.id, makeId("ai-info", date.label, index)),
    date: normalizeDateValue(date.date),
    label: trimRequired(date.label, "Important Date"),
    confidence: normalizeConfidence(date.confidence),
    evidence: evidence(date.evidence),
  }));
  const reconciledCoverage = reconcileNestedNoSchoolCoverage({
    ranges: noSchoolRanges,
    specialDays,
    informationalDates: [
      ...normalizedRawInformationalDates,
      ...reclassifiedInformationalDates,
      ...preservedNoSchoolLabelDates,
    ],
    automaticResolutions,
  });
  noSchoolRanges = reconciledCoverage.ranges;
  specialDays = reconciledCoverage.specialDays;

  const informationalDates = dedupeByKey(
    reconciledCoverage.informationalDates,
    (date) => `${date.date}|${date.label.toLowerCase()}`,
    warnings
  ).sort((a, b) => compareDateStrings(a.date, b.date));

  const impossibleRange = [...noSchoolRanges, ...specialDays].find(
    (range) =>
      isDateString(range.startDate) &&
      isDateString(range.endDate) &&
      compareDateStrings(range.startDate, range.endDate) > 0
  );
  if (impossibleRange) {
    return {
      success: false,
      errors: ["A calendar date range ends before it starts."],
      validationErrors: [{
        path: "dateRanges",
        code: "invalid_date",
        expected: "end date on or after start date",
        received: "reversed date range",
        required: true,
        message: "A calendar date range ends before it starts.",
      }],
    };
  }

  const detectedSchedules = rawDetectedSchedules.map((schedule, index) => {
    const detectedName = trimRequired(schedule.name, `Detected Schedule ${index + 1}`);
    return {
      tempId: trimRequired(schedule.tempId, makeId("ai-schedule", detectedName, index)),
      detectedName,
      normalizedName: normalizeScheduleNameForMatching(detectedName),
      category: schedule.category,
      confidence: normalizeConfidence(schedule.confidence),
      evidence: evidence(schedule.evidence),
      needsSetup: true,
    };
  });
  const detectedScheduleIds = new Set(detectedSchedules.map((schedule) => schedule.tempId));
  const referencedScheduleIds = new Set([
    ...asArray(rawNormalPattern.scheduleTempIds),
    ...specialDays
      .filter((day) => day.isInstructional && day.scheduleTempId)
      .map((day) => day.scheduleTempId as string),
  ]);

  for (const tempId of referencedScheduleIds) {
    if (!tempId || detectedScheduleIds.has(tempId)) continue;
    const detectedName = scheduleNameFromTempId(tempId);
    detectedSchedules.push({
      tempId,
      detectedName,
      normalizedName: normalizeScheduleNameForMatching(detectedName),
      category: "unknown",
      confidence: "review",
      evidence: undefined,
      needsSetup: true,
    });
    detectedScheduleIds.add(tempId);
    warnings.push({
      code: "missing_required_schedule_detected",
      severity: "review",
      message:
        "The PDF referenced a schedule in the calendar pattern that was not listed in the legend. Sundial added it for review.",
    });
  }

  const instructionalStart = normalizeDateValue(raw.firstInstructionalDate);
  const instructionalEnd = normalizeDateValue(raw.lastInstructionalDate);
  const inferredCoverageDates = [
    instructionalStart,
    instructionalEnd,
    ...noSchoolRanges.flatMap((range) => [range.startDate, range.endDate]),
    ...specialDays.flatMap((range) => [range.startDate, range.endDate]),
    ...informationalDates.map((date) => date.date),
  ].filter(isDateString).sort(compareDateStrings);
  const explicitCoverageStart = raw.calendarCoverageStart
    ? normalizeDateValue(raw.calendarCoverageStart)
    : null;
  const explicitCoverageEnd = raw.calendarCoverageEnd
    ? normalizeDateValue(raw.calendarCoverageEnd)
    : null;
  const calendarCoverageStart =
    (explicitCoverageStart && isDateString(explicitCoverageStart) ? explicitCoverageStart : null) ||
    inferredCoverageDates[0] ||
    instructionalStart;
  const calendarCoverageEnd =
    (explicitCoverageEnd && isDateString(explicitCoverageEnd) ? explicitCoverageEnd : null) ||
    inferredCoverageDates[inferredCoverageDates.length - 1] ||
    instructionalEnd;

  let importResult: AiCalendarImportResult = {
    schemaVersion: 1,
    source: options.source,
    analyzedAt: options.analyzedAt || getLocalTodayISO(),
    documentTitle: trimOptional(raw.documentTitle),
    detectedSchoolName: trimOptional(raw.detectedSchoolName),
    expectedInstructionalDayCount: normalizeInteger(raw.expectedInstructionalDayCount),
    declaredInstructionalDayCount: normalizeInteger(raw.expectedInstructionalDayCount),
    legendInterpretation: trimOptional(raw.legendInterpretation),
    extractionNotes: trimOptional(raw.extractionNotes),
    usage: options.usage,
    pageClassifications,
    schoolYear: {
      label: trimOptional(raw.schoolYearLabel) || undefined,
      startDate: calendarCoverageStart,
      endDate: calendarCoverageEnd,
      calendarCoverageStart,
      calendarCoverageEnd,
      instructionalStart,
      instructionalEnd,
      operatingWeekdays: normalizeWeekdays(raw.operatingWeekdays),
      confidence: normalizeConfidence(raw.schoolYearConfidence),
    },
    detectedSchedules,
    pattern: {
      type: rawNormalPattern.type,
      scheduleTempIds: asArray(rawNormalPattern.scheduleTempIds).filter((tempId) =>
        detectedSchedules.some((schedule) => schedule.tempId === tempId)
      ),
      confidence: normalizeConfidence(rawNormalPattern.confidence),
      evidence: evidence(rawNormalPattern.evidence),
    },
    noSchoolRanges,
    specialDays,
    informationalDates,
    warnings,
    automaticResolutions,
  };

  if (
    importResult.schoolYear.confidence !== "high" ||
    importResult.pattern.confidence !== "high" ||
    importResult.detectedSchedules.some((schedule) => schedule.confidence !== "high") ||
    [...importResult.noSchoolRanges, ...importResult.specialDays, ...importResult.informationalDates]
      .some((item) => item.confidence !== "high")
  ) {
    warnings.push({
      code: "low_confidence_classification",
      severity: "review",
      message: "One imported calendar item has a low-confidence classification and needs review.",
    });
  }

  addDateWarnings(importResult, warnings);

  const preReviewValidation = validateAiCalendarImportResult(importResult);
  if (!preReviewValidation.success) return preReviewValidation;

  importResult = initializeInstructionalDayCountReview(
    importResult,
    generateSchoolYearCalendar(buildAiPreviewConfig(importResult))
  );
  if (importResult.instructionalDayCountReview) {
    warnings.push({
      code: "instructional_day_count_mismatch",
      severity: "review",
      message: `The PDF states ${importResult.instructionalDayCountReview.declaredInstructionalDayCount} instructional days, but Sundial currently identifies ${importResult.instructionalDayCountReview.generatedInstructionalDayCount}. Review the additional dates and decide how each should be classified.`,
    });
  }

  const validation = validateAiCalendarImportResult(importResult);
  if (!validation.success) return validation;

  return { success: true, importResult: validation.data };
}

/** Repairs normalized drafts created before the current classification rules without raw PDF data. */
export function normalizePersistedAiCalendarImportResult(
  importResult: AiCalendarImportResult
): AiCalendarImportResult {
  const automaticResolutions = [...(importResult.automaticResolutions || [])];
  const rallySchedule = importResult.detectedSchedules.find((schedule) =>
    isRallyScheduleException(`${schedule.detectedName} ${schedule.category}`)
  );
  const rallyRanges = importResult.noSchoolRanges.filter((range) =>
    isRallyScheduleException(`${range.label} ${range.type || ""}`)
  );
  const retainedNoSchoolRanges = importResult.noSchoolRanges.filter(
    (range) => !rallyRanges.some((rally) => rally.id === range.id)
  );
  const rallySpecialDays = rallyRanges.map((range) => ({
    id: `${range.id}-instructional-rally`,
    startDate: range.startDate,
    endDate: range.endDate,
    label: range.label,
    type: "Rally",
    scheduleTempId: rallySchedule?.tempId,
    isInstructional: true,
    confidence: range.confidence,
    evidence: range.evidence,
  }));
  for (const rally of rallySpecialDays) {
    pushUniqueResolution(automaticResolutions, {
      code: "instructional_schedule_exception_reclassified",
      title: "Rally date kept instructional",
      message: `${rally.label} is a rally schedule exception, not a no-school day.`,
      dateRange: { startDate: rally.startDate, endDate: rally.endDate },
      labelsPreserved: [rally.label],
      originalIds: [rally.id],
    });
  }

  const mergedPreservedLabels: AiDetectedInformationalDate[] = [];
  const mergedNoSchoolRanges = mergeNoSchoolCoverage(
    retainedNoSchoolRanges,
    automaticResolutions,
    mergedPreservedLabels
  );
  const reconciled = reconcileNestedNoSchoolCoverage({
    ranges: mergedNoSchoolRanges,
    specialDays: [...importResult.specialDays, ...rallySpecialDays],
    informationalDates: [...importResult.informationalDates, ...mergedPreservedLabels],
    automaticResolutions,
  });
  const repairedBase: AiCalendarImportResult = {
    ...importResult,
    noSchoolRanges: reconciled.ranges,
    specialDays: reconciled.specialDays,
    informationalDates: dedupeByKey(
      reconciled.informationalDates,
      (item) => `${item.date}|${item.label.toLowerCase()}`,
      []
    ),
    automaticResolutions,
    warnings: importResult.warnings.filter((warning) => {
      const value = `${warning.code} ${warning.message}`.toLowerCase();
      return !(
        /no[-\s]?school/.test(value) &&
        (/special.*overlap/.test(value) || /date remains no[-\s]?school/.test(value))
      );
    }),
    instructionalDayCountReview: undefined,
  };
  return initializeInstructionalDayCountReview(
    repairedBase,
    generateSchoolYearCalendar(buildAiPreviewConfig(repairedBase))
  );
}
