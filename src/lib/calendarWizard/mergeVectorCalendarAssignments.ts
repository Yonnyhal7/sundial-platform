import type { AiCalendarImportResult, AiDetectedSchedule } from "./aiImportTypes";
import type { PdfVectorCalendarResult } from "./pdfVectorCalendarExtraction.server";
import { canonicalScheduleName } from "./scheduleIdentity";

function scheduleForName(schedules: AiDetectedSchedule[], name: string) {
  const normalized = canonicalScheduleName(name);
  return schedules.find((schedule) => canonicalScheduleName(schedule.detectedName) === normalized || canonicalScheduleName(schedule.normalizedName) === normalized);
}

function deduplicateSchedules(importResult: AiCalendarImportResult) {
  const retained = new Map<string, AiDetectedSchedule>();
  const redirects = new Map<string, string>();
  for (const schedule of importResult.detectedSchedules) {
    const key = canonicalScheduleName(schedule.detectedName || schedule.normalizedName);
    const current = retained.get(key);
    if (!current) { retained.set(key, schedule); continue; }
    const preferSchedule = schedule.tempId.startsWith("pdf-vector-") && !current.tempId.startsWith("pdf-vector-");
    const winner = preferSchedule ? schedule : current;
    const loser = preferSchedule ? current : schedule;
    retained.set(key, { ...winner, category: winner.category === "unknown" ? loser.category : winner.category, confidence: winner.confidence === "high" || loser.confidence === "high" ? "high" : winner.confidence, evidence: winner.evidence || loser.evidence, needsSetup: winner.needsSetup && loser.needsSetup });
    redirects.set(loser.tempId, winner.tempId);
  }
  const id = (value: string) => {
    let retainedId = value;
    const seen = new Set<string>();
    while (redirects.has(retainedId) && !seen.has(retainedId)) {
      seen.add(retainedId);
      retainedId = redirects.get(retainedId)!;
    }
    return retainedId;
  };
  return { ...importResult, detectedSchedules: [...retained.values()], pattern: { ...importResult.pattern, scheduleTempIds: [...new Set(importResult.pattern.scheduleTempIds.map(id))] }, specialDays: importResult.specialDays.map((day) => day.scheduleTempId ? { ...day, scheduleTempId: id(day.scheduleTempId) } : day) };
}

export function mergeVectorCalendarAssignments(
  importResult: AiCalendarImportResult,
  vector: PdfVectorCalendarResult
): AiCalendarImportResult {
  if (!vector.supported) return importResult;
  const detectedSchedules = [...importResult.detectedSchedules];
  for (const entry of vector.legend) {
    detectedSchedules.push({
      tempId: `pdf-vector-${canonicalScheduleName(entry.scheduleName)}`,
      detectedName: entry.scheduleName,
      normalizedName: entry.scheduleName,
      category: "unknown",
      confidence: entry.confidence >= 0.95 ? "high" : "review",
      evidence: { page: entry.page, explanation: `Schedule legend swatch ${entry.color}` },
      needsSetup: true,
    });
  }

  const consolidated = deduplicateSchedules({ ...importResult, detectedSchedules });
  const retainedSchedules = consolidated.detectedSchedules;
  const rotationIds = new Set(consolidated.pattern.scheduleTempIds);
  const explicitDays = vector.assignments
    .filter((assignment) => assignment.date >= importResult.schoolYear.startDate && assignment.date <= importResult.schoolYear.endDate)
    .map((assignment) => {
      const schedule = scheduleForName(retainedSchedules, assignment.scheduleName)!;
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
    ...consolidated.specialDays.filter((day) => !explicitDates.has(day.startDate)),
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

  console.info("AI calendar vector schedule registry", retainedSchedules.map((schedule) => ({
    source: schedule.tempId.startsWith("pdf-vector-") ? "pdf_vector_legend" : "ai_detected",
    idType: "temporary",
    displayName: schedule.detectedName,
    canonicalKey: canonicalScheduleName(schedule.detectedName),
    matchedExistingScheduleId: null,
    legendColor: vector.legend.find((entry) => canonicalScheduleName(entry.scheduleName) === canonicalScheduleName(schedule.detectedName))?.color || null,
    referencedByDatedAssignment: explicitDays.some((day) => day.scheduleTempId === schedule.tempId),
  })));

  return {
    ...consolidated,
    detectedSchedules: retainedSchedules,
    specialDays,
    deterministicAssignments: vector.assignments.map(({ date, scheduleName, source, confidence, color }) => ({ date, scheduleName, source, confidence, color })),
    legendMappings: vector.legend.map((entry) => ({ normalizedColor: entry.color.toLowerCase(), canonicalScheduleKey: canonicalScheduleName(entry.scheduleName), scheduleId: scheduleForName(retainedSchedules, entry.scheduleName)!.tempId })),
    firstInstructionalAssignment: first ? {
      date: firstDate,
      scheduleName: first.scheduleName,
      source: "pdf_vector_fill",
      confidence: first.confidence,
    } : { date: firstDate, scheduleName: null, source: "unresolved", confidence: 0 },
    deterministicExtraction: { status: "succeeded", reasonCodes: [] },
    assignmentReview: undefined,
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
