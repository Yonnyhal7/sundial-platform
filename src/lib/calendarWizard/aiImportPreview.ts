import type { AiCalendarImportResult } from "./aiImportTypes";
import type {
  CalendarGenerationResult,
  CalendarWizardConfig,
  CalendarDateClassification,
  Weekday,
} from "./types";
import { updateInstructionalDayCountReviewDate } from "./instructionalDayCountReview";

export type AiPreviewScheduleSummary = {
  id: string;
  name: string;
};

export function buildAiPreviewConfig(
  importResult: AiCalendarImportResult
): CalendarWizardConfig {
  const pattern =
    importResult.pattern.type === "same"
      ? {
          type: "same" as const,
          scheduleId: importResult.pattern.scheduleTempIds[0] || "",
        }
      : importResult.pattern.type === "weekday"
        ? {
            type: "weekday" as const,
            schedulesByWeekday: Object.fromEntries(
              importResult.schoolYear.operatingWeekdays.map((weekday, index) => [
                weekday,
                importResult.pattern.scheduleTempIds[index] ||
                  importResult.pattern.scheduleTempIds[0] ||
                  "",
              ])
            ) as Partial<Record<Weekday, string>>,
          }
        : {
            type: "repeating" as const,
            scheduleIds: importResult.pattern.scheduleTempIds,
          };

  return {
    schoolYear: {
      name: importResult.schoolYear.label,
      startDate: importResult.schoolYear.startDate,
      endDate: importResult.schoolYear.endDate,
      calendarCoverageStart:
        importResult.schoolYear.calendarCoverageStart || importResult.schoolYear.startDate,
      calendarCoverageEnd:
        importResult.schoolYear.calendarCoverageEnd || importResult.schoolYear.endDate,
      instructionalStart:
        importResult.schoolYear.instructionalStart || importResult.schoolYear.startDate,
      instructionalEnd:
        importResult.schoolYear.instructionalEnd || importResult.schoolYear.endDate,
    },
    operatingWeekdays: importResult.schoolYear.operatingWeekdays,
    pattern,
    noSchoolRanges: importResult.noSchoolRanges,
    specialDays: importResult.specialDays.map((day) => ({
      ...day,
      scheduleId: day.isInstructional ? day.scheduleTempId || null : null,
      rotationBehavior: day.rotationBehavior || "pause",
      assignmentSource: day.assignmentSource === "administrator"
        ? "administrator"
        : day.assignmentSource === "explicit_text"
          ? "explicit_text"
          : "genuine_special",
    })),
    datedScheduleAssignments: (importResult.datedScheduleAssignments || []).map((assignment) => ({
      id: assignment.id,
      date: assignment.date,
      scheduleId: assignment.scheduleTempId,
      source: assignment.source,
      confidence: assignment.confidence,
      label: assignment.scheduleName,
      rotationBehavior: assignment.rotationBehavior,
    })),
    informationalDates: importResult.informationalDates,
    dateClassifications: (importResult.dateClassifications || []).map((classification) => ({
      ...classification,
      scheduleId: classification.scheduleTempId,
    })),
  };
}

function withoutDateFromRanges<T extends { id: string; startDate: string; endDate: string }>(
  ranges: T[],
  date: string
) {
  return ranges.flatMap((range) => {
    if (date < range.startDate || date > range.endDate) return [range];
    const pieces: T[] = [];
    const previous = new Date(`${date}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const previousDate = previous.toISOString().slice(0, 10);
    const nextDate = next.toISOString().slice(0, 10);
    if (range.startDate < date) pieces.push({ ...range, id: `${range.id}-before-${date}`, endDate: previousDate });
    if (range.endDate > date) pieces.push({ ...range, id: `${range.id}-after-${date}`, startDate: nextDate });
    return pieces;
  });
}

export function updateAiImportPreviewDay(importResult: AiCalendarImportResult, edit: {
  date: string;
  scheduleTempId: string | null;
  classification: CalendarDateClassification;
  note: string;
  rotationBehavior?: "advance" | "pause" | "restart";
}) {
  const noSchoolRanges = withoutDateFromRanges(importResult.noSchoolRanges, edit.date);
  const specialDays = withoutDateFromRanges(importResult.specialDays, edit.date);
  const informationalDates = importResult.informationalDates.filter(
    (item) => item.id !== `manual-info-${edit.date}`
  );
  const dateClassifications = (importResult.dateClassifications || []).filter(
    (item) => item.date !== edit.date
  );

  if (edit.classification === "instructional") {
    specialDays.push({
      id: `manual-special-${edit.date}`,
      startDate: edit.date,
      endDate: edit.date,
      label: edit.note.trim() || "Preview day edit",
      type: "Manual Edit",
      scheduleTempId: edit.scheduleTempId || undefined,
      isInstructional: true,
      rotationBehavior: edit.rotationBehavior || "pause",
      confidence: "high",
      evidence: { explanation: "Administrator preview edit" },
      assignmentSource: "administrator",
      assignmentConfidence: 1,
    });
  } else if (edit.classification === "no_school") {
    noSchoolRanges.push({
      id: `manual-no-school-${edit.date}`,
      startDate: edit.date,
      endDate: edit.date,
      label: edit.note.trim() || "No School",
      type: "No School",
      confidence: "high",
      evidence: { explanation: "Administrator preview edit" },
    });
  }

  const classification = {
    date: edit.date,
    classification: edit.classification,
    scheduleTempId: edit.classification === "instructional" ? edit.scheduleTempId : null,
    label: edit.note.trim() || undefined,
    sourceLabel:
      importResult.instructionalDayCountReview?.discrepancyDates.find(
        (item) => item.date === edit.date
      )?.sourceLabel,
    confidence: 1,
    rotationBehavior: edit.rotationBehavior || "pause",
  };
  dateClassifications.push(classification);

  if (edit.note.trim()) {
    informationalDates.push({
      id: `manual-info-${edit.date}`,
      date: edit.date,
      label: edit.note.trim(),
      confidence: "high",
      evidence: { explanation: "Administrator preview edit" },
    });
  }

  const assignmentReview = importResult.assignmentReview
    ? {
        ...importResult.assignmentReview,
        reviewedDates: importResult.assignmentReview.requiredDates.includes(edit.date)
          ? [...new Set([...importResult.assignmentReview.reviewedDates, edit.date])]
          : importResult.assignmentReview.reviewedDates,
      }
    : undefined;
  return updateInstructionalDayCountReviewDate(
    {
      ...importResult,
      noSchoolRanges,
      specialDays,
      informationalDates,
      dateClassifications,
      assignmentReview,
    },
    classification
  );
}

export function getUnreviewedRequiredAssignmentDates(importResult: AiCalendarImportResult) {
  if (!importResult.assignmentReview) return [];
  const reviewed = new Set(importResult.assignmentReview.reviewedDates);
  return importResult.assignmentReview.requiredDates.filter((date) => !reviewed.has(date));
}

export function hasBrownGoldVerificationScheduleSet(
  scheduleMap: Map<string, AiPreviewScheduleSummary>
) {
  const scheduleNames = [...scheduleMap.values()].map((schedule) =>
    schedule.name.toLowerCase()
  );
  return (
    scheduleNames.some((name) => name.includes("brown")) &&
    scheduleNames.some((name) => name.includes("gold")) &&
    scheduleNames.some((name) => name.includes("all period"))
  );
}

function getScheduleName(
  scheduleMap: Map<string, AiPreviewScheduleSummary>,
  id: string | null
) {
  if (!id) return "No schedule";
  return scheduleMap.get(id)?.name || "Unknown schedule";
}

export function getBrownGoldVerificationRows(
  result: CalendarGenerationResult,
  scheduleMap: Map<string, AiPreviewScheduleSummary>
) {
  const expected = [
    ["2026-08-12", "all period"],
    ["2026-08-13", "brown"],
    ["2026-08-14", "gold"],
    ["2026-08-17", "brown"],
    ["2026-08-18", "gold"],
    ["2026-08-19", "brown"],
    ["2026-08-20", "gold"],
    ["2026-08-21", "brown"],
  ] as const;

  return expected.map(([date, expectedName]) => {
    const day = result.days.find((calendarDay) => calendarDay.date === date);
    const actual = getScheduleName(scheduleMap, day?.scheduleId || null);
    return {
      date,
      expected: expectedName,
      actual,
      matches: actual.toLowerCase().includes(expectedName),
    };
  });
}

export function getBrownGoldVerificationConflicts(
  result: CalendarGenerationResult,
  scheduleMap: Map<string, AiPreviewScheduleSummary>
) {
  if (!hasBrownGoldVerificationScheduleSet(scheduleMap)) return [];
  return getBrownGoldVerificationRows(result, scheduleMap).filter(
    (row) => !row.matches
  );
}

export function getDeterministicAssignmentConflicts(
  importResult: AiCalendarImportResult,
  result: CalendarGenerationResult,
  scheduleMap: Map<string, AiPreviewScheduleSummary>,
  instructionalDayLimit = 10
) {
  const firstInstructionalDates = new Set(
    result.days.filter((day) => day.isSchoolDay).slice(0, instructionalDayLimit).map((day) => day.date)
  );
  return (importResult.deterministicAssignments || [])
    .filter((assignment) => firstInstructionalDates.has(assignment.date))
    .flatMap((assignment) => {
      const day = result.days.find((candidate) => candidate.date === assignment.date);
      const actual = getScheduleName(scheduleMap, day?.scheduleId || null);
      return actual.toLowerCase() === assignment.scheduleName.toLowerCase() ? [] : [{
        date: assignment.date,
        expected: assignment.scheduleName,
        actual,
        source: assignment.source,
        confidence: assignment.confidence,
      }];
    });
}
