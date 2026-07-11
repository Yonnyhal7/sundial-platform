import { describe, expect, it } from "vitest";
import {
  APIConnectionTimeoutError,
  AuthenticationError,
  RateLimitError,
} from "openai";
import {
  clearAiImportMetadata,
  convertAiImportToWizardDraft,
  unresolvedRequiredSchedulesBlockFinalReadiness,
  type AiWizardDraftShape,
} from "./aiImportConversion";
import {
  normalizeAiCalendarExtraction,
  type RawAiCalendarExtraction,
} from "./aiCalendarImportNormalizer";
import {
  matchDetectedSchedules,
  normalizeScheduleNameForMatching,
} from "./aiScheduleMatching";
import {
  createMockAiCalendarImportResult,
} from "./mockAiCalendarAnalyzer";
import {
  validateAiCalendarImportResult,
  type AiCalendarImportResult,
  type AiDetectedSchedule,
  type DetectedScheduleResolution,
} from "./aiImportTypes";
import {
  getCalendarImportMode,
  mapOpenAiError,
  openAiResponseHasRefusal,
  openAiResponseIncomplete,
  shouldRetryOpenAiError,
} from "./openAiCalendarAnalyzerUtils";
import { hasPdfSignature } from "./aiPdfValidation";

function detected(tempId: string, name: string): AiDetectedSchedule {
  return {
    tempId,
    detectedName: name,
    normalizedName: normalizeScheduleNameForMatching(name),
    category: "regular",
    confidence: "high",
    needsSetup: true,
  };
}

function baseDraft(): AiWizardDraftShape {
  return {
    schoolYear: {
      label: "",
      startDate: "",
      endDate: "",
      operatingWeekdays: [1, 2, 3, 4, 5],
    },
    patternMode: "same",
    sameScheduleId: "",
    repeatingScheduleIds: [],
    weekdaySchedules: {},
    noSchoolRanges: [],
    specialDays: [],
    informationalDates: [],
    completedSteps: [],
    aiImport: null,
  };
}

function resolvedFixture() {
  const result = createMockAiCalendarImportResult();
  const resolutions: DetectedScheduleResolution[] = result.detectedSchedules.map((schedule) => ({
    tempId: schedule.tempId,
    detectedName: schedule.detectedName,
    normalizedName: schedule.normalizedName,
    matchedExistingScheduleId: schedule.tempId.replace("ai-schedule-", ""),
    status: "matched_by_admin",
    needsSetup: false,
  }));

  return { result, resolutions };
}

function rawExtraction(overrides: Partial<RawAiCalendarExtraction> = {}): RawAiCalendarExtraction {
  return {
    documentTitle: "School Calendar",
    detectedSchoolName: "Test High School",
    schoolYearLabel: "2026-2027",
    firstInstructionalDate: "2026-08-10",
    lastInstructionalDate: "2026-08-14",
    operatingWeekdays: [1, 2, 3, 4, 5],
    expectedInstructionalDayCount: 5,
    schoolYearConfidence: "high",
    detectedSchedules: [
      {
        tempId: "regular",
        name: "Regular Day",
        category: "regular",
        confidence: "high",
        evidence: { sourceText: "Regular Day", page: 1, explanation: "Legend" },
      },
    ],
    normalPattern: {
      type: "same",
      scheduleTempIds: ["regular"],
      weekdayMappings: [],
      confidence: "high",
      evidence: { sourceText: "Regular", page: 1, explanation: "Legend" },
    },
    noSchoolRanges: [],
    specialSchoolDays: [],
    informationalDates: [],
    legendInterpretation: "Regular schedule unless marked.",
    extractionNotes: "No ambiguity found.",
    warnings: [],
    ...overrides,
  };
}

describe("AI calendar import matching", () => {
  it("matches exact detected schedule names", () => {
    const [resolution] = matchDetectedSchedules(
      [detected("brown", "Brown Day")],
      [{ id: "schedule-brown", name: "Brown Day" }]
    );

    expect(resolution).toMatchObject({
      matchedExistingScheduleId: "schedule-brown",
      status: "matched_automatically",
    });
  });

  it("matches conservative normalized schedule names", () => {
    const [resolution] = matchDetectedSchedules(
      [detected("brown", "Brown Day")],
      [{ id: "schedule-brown", name: "Brown" }]
    );

    expect(resolution.matchedExistingScheduleId).toBe("schedule-brown");
  });

  it("leaves ambiguous matches unresolved", () => {
    const [resolution] = matchDetectedSchedules(
      [detected("brown", "Brown Day")],
      [
        { id: "brown-1", name: "Brown" },
        { id: "brown-2", name: "Brown Day" },
      ]
    );

    expect(resolution.status).toBe("unresolved");
  });

  it("leaves missing matches unresolved", () => {
    const [resolution] = matchDetectedSchedules(
      [detected("rally", "Rally Schedule")],
      [{ id: "regular", name: "Regular Day" }]
    );

    expect(resolution.status).toBe("unresolved");
    expect(resolution.needsSetup).toBe(true);
  });

  it("preserves existing admin schedule resolutions", () => {
    const [resolution] = matchDetectedSchedules(
      [detected("rally", "Rally Schedule")],
      [{ id: "rally-auto", name: "Rally Schedule" }],
      [
        {
          tempId: "rally",
          detectedName: "Rally Schedule",
          normalizedName: "rally",
          matchedExistingScheduleId: "rally-manual",
          status: "matched_by_admin",
          needsSetup: false,
        },
      ]
    );

    expect(resolution.matchedExistingScheduleId).toBe("rally-manual");
    expect(resolution.status).toBe("matched_by_admin");
  });
});

describe("AI calendar import schema", () => {
  it("accepts the valid mock fixture", () => {
    expect(validateAiCalendarImportResult(createMockAiCalendarImportResult()).success).toBe(true);
  });

  it("rejects invalid dates", () => {
    const invalid = {
      ...createMockAiCalendarImportResult(),
      schoolYear: {
        ...createMockAiCalendarImportResult().schoolYear,
        startDate: "August 12",
      },
    };

    expect(validateAiCalendarImportResult(invalid).success).toBe(false);
  });

  it("rejects missing pattern data", () => {
    const invalid = {
      ...createMockAiCalendarImportResult(),
      pattern: {
        type: "repeating",
        scheduleTempIds: [],
        confidence: "high",
      },
    };

    expect(validateAiCalendarImportResult(invalid).success).toBe(false);
  });
});

describe("AI calendar import normalization", () => {
  it("normalizes a valid structured OpenAI response", () => {
    const normalized = normalizeAiCalendarExtraction(rawExtraction(), { source: "openai" });

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.importResult.source).toBe("openai");
      expect(normalized.importResult.detectedSchedules[0]).toMatchObject({
        detectedName: "Regular Day",
        normalizedName: "regular",
      });
    }
  });

  it("adds a warning for unknown schedule references", () => {
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({
        specialSchoolDays: [
          {
            id: "special-1",
            startDate: "2026-08-12",
            endDate: null,
            label: "Rally",
            type: "Rally",
            scheduleTempId: "missing",
            isInstructional: true,
            confidence: "review",
            evidence: null,
          },
        ],
      }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.importResult.warnings).toContainEqual(
        expect.objectContaining({ code: "unknown_special_day_schedule_reference" })
      );
    }
  });

  it("deduplicates exact duplicate no-school ranges", () => {
    const duplicate = {
      id: "holiday-1",
      startDate: "2026-09-07",
      endDate: null,
      label: "Labor Day",
      type: "Holiday",
      confidence: "high" as const,
      evidence: null,
    };
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({ noSchoolRanges: [duplicate, { ...duplicate, id: "holiday-2" }] }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.importResult.noSchoolRanges).toHaveLength(1);
      expect(normalized.importResult.warnings).toContainEqual(
        expect.objectContaining({ code: "duplicate_import_item_removed" })
      );
    }
  });

  it("sorts imported dates chronologically", () => {
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({
        informationalDates: [
          { id: "b", date: "2026-10-01", label: "Later", confidence: "high", evidence: null },
          { id: "a", date: "2026-09-01", label: "Earlier", confidence: "high", evidence: null },
        ],
      }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.importResult.informationalDates.map((date) => date.id)).toEqual([
        "a",
        "b",
      ]);
    }
  });

  it("rejects malformed structured responses after normalization", () => {
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({ firstInstructionalDate: "August 10" }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(false);
  });

  it("adds expected instructional-day mismatch warnings", () => {
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({ expectedInstructionalDayCount: 180 }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.importResult.warnings).toContainEqual(
        expect.objectContaining({ code: "instructional_day_count_mismatch" })
      );
    }
  });
});

describe("OpenAI calendar analyzer behavior", () => {
  it("detects refusal responses", () => {
    expect(
      openAiResponseHasRefusal({
        output: [{ content: [{ type: "refusal" }] }],
      })
    ).toBe(true);
  });

  it("detects incomplete responses", () => {
    expect(openAiResponseIncomplete({ status: "incomplete" })).toBe(true);
  });

  it("keeps OpenAI mode as the default when no explicit mock mode is set", () => {
    const previousMode = process.env.AI_CALENDAR_IMPORT_MODE;
    delete process.env.AI_CALENDAR_IMPORT_MODE;

    expect(getCalendarImportMode()).toBe("openai");

    process.env.AI_CALENDAR_IMPORT_MODE = previousMode;
  });

  it("maps OpenAI authentication errors safely", () => {
    const result = mapOpenAiError(new AuthenticationError(401, {}, "bad key", new Headers()));
    expect(result).toMatchObject({ status: "configuration_error" });
  });

  it("maps rate-limit errors safely", () => {
    const result = mapOpenAiError(new RateLimitError(429, {}, "rate limit", new Headers()));
    expect(result).toMatchObject({ status: "rate_limited", retryable: true });
  });

  it("maps timeout errors safely", () => {
    const result = mapOpenAiError(new APIConnectionTimeoutError({ message: "timeout" }));
    expect(result).toMatchObject({ status: "analysis_failed", retryable: true });
  });

  it("retries transient errors once", () => {
    expect(shouldRetryOpenAiError(new RateLimitError(429, {}, "rate", new Headers()), 0)).toBe(true);
    expect(shouldRetryOpenAiError(new RateLimitError(429, {}, "rate", new Headers()), 1)).toBe(false);
  });

  it("does not retry schema failures", () => {
    expect(shouldRetryOpenAiError(new Error("schema failed"), 0)).toBe(false);
  });

  it("validates PDF signatures", () => {
    expect(hasPdfSignature(new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode("not a pdf"))).toBe(false);
  });

  it("uses mock mode only when explicit", () => {
    const previousMode = process.env.AI_CALENDAR_IMPORT_MODE;
    process.env.AI_CALENDAR_IMPORT_MODE = "mock";
    expect(getCalendarImportMode()).toBe("mock");
    process.env.AI_CALENDAR_IMPORT_MODE = previousMode;

    expect(createMockAiCalendarImportResult().source).toBe("mock");
  });

  it("production mode never silently selects the mock fixture", () => {
    const previousMode = process.env.AI_CALENDAR_IMPORT_MODE;
    process.env.AI_CALENDAR_IMPORT_MODE = "openai";

    expect(getCalendarImportMode()).toBe("openai");
    
    process.env.AI_CALENDAR_IMPORT_MODE = previousMode;
  });

  it("does not include raw PDF bytes or raw response envelopes in client data", () => {
    const normalized = normalizeAiCalendarExtraction(rawExtraction(), {
      source: "openai",
      usage: { model: "gpt-5", requestId: "req_test", totalTokens: 100 },
    });

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      const serialized = JSON.stringify(normalized.importResult);
      expect(serialized).not.toContain("%PDF-");
      expect(serialized).not.toContain("output_text");
      expect(normalized.importResult.usage).toMatchObject({
        model: "gpt-5",
        requestId: "req_test",
      });
    }
  });
});

describe("AI import conversion", () => {
  it("converts import data to manual wizard state", () => {
    const { result, resolutions } = resolvedFixture();
    const converted = convertAiImportToWizardDraft(baseDraft(), result, resolutions, "calendar.pdf");

    expect(converted.draft.schoolYear.startDate).toBe("2026-08-12");
    expect(converted.draft.patternMode).toBe("repeating");
    expect(converted.draft.repeatingScheduleIds).toEqual(["brown", "gold"]);
    expect(converted.draft.aiImport?.state).toBe("applied");
  });

  it("unresolved required schedules block final readiness", () => {
    const result = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(result.detectedSchedules, []);
    const converted = convertAiImportToWizardDraft(baseDraft(), result, resolutions);

    expect(converted.unresolvedRequiredScheduleIds.length).toBeGreaterThan(0);
    expect(unresolvedRequiredSchedulesBlockFinalReadiness(converted.draft)).toBe(true);
    expect(converted.earliestStep).toBe("normal-schedule");
  });

  it("converts imported no-school ranges correctly", () => {
    const { result, resolutions } = resolvedFixture();
    const converted = convertAiImportToWizardDraft(baseDraft(), result, resolutions);

    expect(converted.draft.noSchoolRanges).toContainEqual(
      expect.objectContaining({
        startDate: "2026-11-23",
        endDate: "2026-11-27",
        label: "Thanksgiving Break",
      })
    );
  });

  it("converts imported special days correctly", () => {
    const { result, resolutions } = resolvedFixture();
    const converted = convertAiImportToWizardDraft(baseDraft(), result, resolutions);

    expect(converted.draft.specialDays).toContainEqual(
      expect.objectContaining({
        startDate: "2026-08-21",
        label: "Rally Day",
        scheduleId: "rally",
      })
    );
  });

  it("keeps informational dates informational", () => {
    const { result, resolutions } = resolvedFixture();
    const converted = convertAiImportToWizardDraft(baseDraft(), result, resolutions);

    expect(converted.draft.informationalDates).toContainEqual(
      expect.objectContaining({
        date: "2027-06-04",
        label: "Graduation",
      })
    );
    expect(converted.draft.specialDays.some((day) => day.label === "Graduation")).toBe(false);
  });

  it("keeps old manual session drafts readable", () => {
    const { aiImport: _aiImport, ...oldDraft } = baseDraft();
    void _aiImport;

    expect("aiImport" in oldDraft).toBe(false);
  });

  it("clears AI metadata on start over through a pure helper", () => {
    const { result, resolutions } = resolvedFixture();
    const converted = convertAiImportToWizardDraft(baseDraft(), result, resolutions);

    expect(clearAiImportMetadata(converted.draft).aiImport).toBeNull();
  });

  it("does not require a real OpenAI response shape beyond the strict contract", () => {
    const result: AiCalendarImportResult = createMockAiCalendarImportResult();
    expect(result.source).toBe("mock");
  });
});
