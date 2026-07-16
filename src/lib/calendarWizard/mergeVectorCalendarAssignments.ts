import type { AiCalendarImportResult, AiDetectedSchedule } from "./aiImportTypes";
import type { PdfVectorCalendarResult } from "./pdfVectorCalendarExtraction.server";

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function scheduleForName(schedules: AiDetectedSchedule[], name: string) {
  const normalized = slug(name);
  return schedules.find((schedule) => slug(schedule.detectedName) === normalized || slug(schedule.normalizedName) === normalized);
}

export function mergeVectorCalendarAssignments(
  importResult: AiCalendarImportResult,
  vector: PdfVectorCalendarResult
): AiCalendarImportResult {
  if (!vector.supported) return importResult;
  const detectedSchedules = [...importResult.detectedSchedules];
  for (const entry of vector.legend) {
    if (scheduleForName(detectedSchedules, entry.scheduleName)) continue;
    detectedSchedules.push({
      tempId: `pdf-vector-${slug(entry.scheduleName)}`,
      detectedName: entry.scheduleName,
      normalizedName: entry.scheduleName,
      category: "unknown",
      confidence: entry.confidence >= 0.95 ? "high" : "review",
      evidence: { page: entry.page, explanation: `Schedule legend swatch ${entry.color}` },
      needsSetup: true,
    });
  }

  const rotationIds = new Set(importResult.pattern.scheduleTempIds);
  const explicitDays = vector.assignments
    .filter((assignment) => assignment.date >= importResult.schoolYear.startDate && assignment.date <= importResult.schoolYear.endDate)
    .map((assignment) => {
      const schedule = scheduleForName(detectedSchedules, assignment.scheduleName)!;
      return {
        id: `pdf-vector-${assignment.date}`,
        startDate: assignment.date,
        endDate: assignment.date,
        label: assignment.scheduleName,
        type: "PDF vector assignment",
        scheduleTempId: schedule.tempId,
        isInstructional: true,
        rotationBehavior: rotationIds.has(schedule.tempId) ? "advance" as const : "pause" as const,
        confidence: assignment.confidence >= 0.95 ? "high" as const : "review" as const,
        evidence: { page: assignment.page, explanation: `Explicit calendar cell fill ${assignment.color}` },
        assignmentSource: "pdf_vector_fill" as const,
        assignmentConfidence: assignment.confidence,
      };
    });
  const explicitDates = new Set(explicitDays.map((day) => day.startDate));
  const specialDays = [
    ...importResult.specialDays.filter((day) => !explicitDates.has(day.startDate)),
    ...explicitDays,
  ].sort((a, b) => a.startDate.localeCompare(b.startDate));

  const firstDate = importResult.schoolYear.startDate;
  const first = vector.assignments.find((assignment) => assignment.date === firstDate);
  const warnings = importResult.warnings.filter((warning) => warning.code !== "first_instructional_schedule_unresolved");
  if (!first || first.confidence < 0.95) {
    warnings.push({
      code: "first_instructional_schedule_unresolved",
      severity: "blocking",
      message: "The first instructional day has no high-confidence explicit schedule. Select its schedule before creating the calendar.",
    });
  }

  return {
    ...importResult,
    detectedSchedules,
    specialDays,
    deterministicAssignments: vector.assignments.map(({ date, scheduleName, source, confidence, color }) => ({ date, scheduleName, source, confidence, color })),
    firstInstructionalAssignment: first ? {
      date: firstDate,
      scheduleName: first.scheduleName,
      source: "pdf_vector_fill",
      confidence: first.confidence,
    } : { date: firstDate, scheduleName: null, source: "unresolved", confidence: 0 },
    warnings,
  };
}

export function ensureFirstInstructionalAnchor(importResult: AiCalendarImportResult) {
  if (importResult.firstInstructionalAssignment) return importResult;
  const firstDate = importResult.schoolYear.startDate;
  const explicitTextDay = importResult.specialDays.find((day) =>
    day.startDate === firstDate && day.endDate === firstDate && day.isInstructional &&
    day.scheduleTempId && day.evidence?.sourceText
  );
  const schedule = explicitTextDay?.scheduleTempId
    ? importResult.detectedSchedules.find((item) => item.tempId === explicitTextDay.scheduleTempId)
    : undefined;
  const confidence = explicitTextDay?.confidence === "high" ? 1 : explicitTextDay ? 0.8 : 0;
  const warnings = importResult.warnings.filter((warning) => warning.code !== "first_instructional_schedule_unresolved");
  if (!schedule || confidence < 0.95) {
    warnings.push({
      code: "first_instructional_schedule_unresolved",
      severity: "blocking",
      message: "The first instructional day has no high-confidence explicit schedule. Select its schedule before creating the calendar.",
    });
  }
  return {
    ...importResult,
    firstInstructionalAssignment: schedule ? {
      date: firstDate, scheduleName: schedule.detectedName, source: "explicit_text" as const, confidence,
    } : { date: firstDate, scheduleName: null, source: "unresolved" as const, confidence: 0 },
    warnings,
  };
}
