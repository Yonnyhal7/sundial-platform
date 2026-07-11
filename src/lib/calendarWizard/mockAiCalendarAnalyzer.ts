import { normalizeScheduleNameForMatching } from "./aiScheduleMatching";
import type { AiCalendarImportResult, AiDetectedScheduleCategory } from "./aiImportTypes";
import { validateAiCalendarImportResult } from "./aiImportTypes";

function detectedSchedule(
  tempId: string,
  detectedName: string,
  category: AiDetectedScheduleCategory,
  sourceText: string
) {
  return {
    tempId,
    detectedName,
    normalizedName: normalizeScheduleNameForMatching(detectedName),
    category,
    confidence: "review" as const,
    needsSetup: true,
    evidence: {
      sourceText,
      page: 1,
      explanation: "Detected from the mocked Del Oro-style calendar legend.",
    },
  };
}

export function createMockAiCalendarImportResult(): AiCalendarImportResult {
  return {
    schemaVersion: 1,
    source: "mock",
    analyzedAt: "2026-07-11",
    schoolYear: {
      label: "2026-2027",
      startDate: "2026-08-12",
      endDate: "2027-06-03",
      operatingWeekdays: [1, 2, 3, 4, 5],
      confidence: "high",
      evidence: {
        sourceText: "First day of school: August 12, 2026. Last day: June 3, 2027.",
        page: 1,
      },
    },
    detectedSchedules: [
      detectedSchedule("ai-schedule-brown", "Brown Day", "rotation", "Brown/Gold rotation"),
      detectedSchedule("ai-schedule-gold", "Gold Day", "rotation", "Brown/Gold rotation"),
      detectedSchedule("ai-schedule-rally", "Rally Schedule", "special", "3rd block rally - split"),
      detectedSchedule("ai-schedule-minimum", "Minimum Day", "minimum", "Minimum day bell schedule"),
      detectedSchedule("ai-schedule-finals", "Finals", "finals", "Finals schedule"),
    ],
    pattern: {
      type: "repeating",
      scheduleTempIds: ["ai-schedule-brown", "ai-schedule-gold"],
      confidence: "review",
      evidence: {
        sourceText: "Calendar legend alternates Brown and Gold days.",
        page: 1,
      },
    },
    noSchoolRanges: [
      {
        id: "ai-no-school-labor-day",
        startDate: "2026-09-07",
        label: "Labor Day",
        type: "Holiday",
        confidence: "high",
      },
      {
        id: "ai-no-school-fall-break",
        startDate: "2026-11-23",
        endDate: "2026-11-27",
        label: "Thanksgiving Break",
        type: "School Break",
        confidence: "high",
      },
      {
        id: "ai-no-school-winter-break",
        startDate: "2026-12-21",
        endDate: "2027-01-01",
        label: "Winter Break",
        type: "School Break",
        confidence: "high",
      },
      {
        id: "ai-no-school-spring-break",
        startDate: "2027-04-05",
        endDate: "2027-04-09",
        label: "Spring Break",
        type: "School Break",
        confidence: "high",
      },
    ],
    specialDays: [
      {
        id: "ai-special-first-day",
        startDate: "2026-08-12",
        label: "First Day of School",
        type: "First Day",
        isInstructional: true,
        confidence: "high",
      },
      {
        id: "ai-special-rally",
        startDate: "2026-08-21",
        label: "Rally Day",
        type: "Rally",
        scheduleTempId: "ai-schedule-rally",
        isInstructional: true,
        confidence: "review",
        evidence: {
          sourceText: "August 21, 2026 3rd block rally - Split (in gym)",
          page: 1,
          explanation: "The note next to August 21 identifies a rally schedule.",
        },
      },
      {
        id: "ai-special-finals",
        startDate: "2026-12-16",
        endDate: "2026-12-18",
        label: "Fall Finals",
        type: "Finals",
        scheduleTempId: "ai-schedule-finals",
        isInstructional: true,
        confidence: "review",
      },
      {
        id: "ai-special-minimum",
        startDate: "2027-06-03",
        label: "Last Day Minimum Day",
        type: "Minimum Day",
        scheduleTempId: "ai-schedule-minimum",
        isInstructional: true,
        confidence: "review",
      },
    ],
    informationalDates: [
      {
        id: "ai-info-graduation",
        date: "2027-06-04",
        label: "Graduation",
        confidence: "review",
      },
      {
        id: "ai-info-quarter-end",
        date: "2026-10-09",
        label: "First Quarter Ends",
        confidence: "review",
      },
    ],
    warnings: [
      {
        code: "mock_analyzer",
        severity: "info",
        message:
          "This beta import is using a mocked analyzer. Review every item before generating your calendar.",
      },
      {
        code: "schedule_resolution_required",
        severity: "review",
        message:
          "Some detected bell schedules may need to be matched to existing Sundial schedules.",
      },
    ],
  };
}

export async function analyzeCalendarPdf(file: File): Promise<AiCalendarImportResult> {
  void file;
  // Phase 3.5A deliberately returns a fixture. Phase 3.5B can replace this
  // function with an OpenAI structured-output call without changing callers.
  const result = createMockAiCalendarImportResult();
  const validation = validateAiCalendarImportResult(result);

  if (!validation.success) {
    throw new Error(`Mock AI calendar fixture is invalid: ${validation.errors.join("; ")}`);
  }

  return validation.data;
}
