import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APIConnectionTimeoutError,
  AuthenticationError,
  RateLimitError,
} from "openai";
import {
  clearAiImportMetadata,
  convertAiImportToWizardDraft,
  getAiImportReadinessSummary,
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
  DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS,
  AiCalendarImportProcessingError,
  MAX_OPENAI_CALENDAR_TIMEOUT_MS,
  MIN_OPENAI_CALENDAR_TIMEOUT_MS,
  OpenAiCalendarApplicationTimeoutError,
  getCalendarImportMode,
  getOpenAiCalendarConfiguration,
  getOpenAiCalendarPdfModel,
  getOpenAiCalendarTextModel,
  buildOpenAiErrorDiagnostics,
  createOpenAiCalendarTimeoutController,
  mapOpenAiError,
  openAiResponseHasRefusal,
  openAiResponseIncomplete,
  parseOpenAiCalendarTimeoutMs,
  shouldRetryOpenAiError,
} from "./openAiCalendarAnalyzerUtils";
import { hasPdfSignature } from "./aiPdfValidation";
import {
  buildCalendarImportResponsesRequest,
  buildCalendarImportTextResponsesRequest,
} from "./openAiCalendarRequest";
import {
  AI_IMPORT_MIN_PDF_FALLBACK_BUDGET_MS,
  AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS,
  AI_IMPORT_ROUTE_RESPONSE_RESERVE_MS,
  hasAiImportPdfFallbackBudget,
} from "./aiImportTimeouts";

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
    pageClassifications: [
      {
        page: 1,
        role: "student_attendance_calendar",
        confidence: "high",
        evidence: { sourceText: "Student Attendance Calendar", page: 1, explanation: "Title" },
      },
    ],
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
      reviewedName: "Brown Day",
    });
  });

  it("matches conservative normalized schedule names", () => {
    const [resolution] = matchDetectedSchedules(
      [detected("brown", "Brown Day")],
      [{ id: "schedule-brown", name: "Brown" }]
    );

    expect(resolution.matchedExistingScheduleId).toBe("schedule-brown");
  });

  it("marks ambiguous matches as detected schedules needing times", () => {
    const [resolution] = matchDetectedSchedules(
      [detected("brown", "Brown Day")],
      [
        { id: "brown-1", name: "Brown" },
        { id: "brown-2", name: "Brown Day" },
      ]
    );

    expect(resolution.status).toBe("needs_times");
  });

  it("marks missing matches as detected schedules needing times", () => {
    const [resolution] = matchDetectedSchedules(
      [detected("rally", "Rally Schedule")],
      [{ id: "regular", name: "Regular Day" }]
    );

    expect(resolution.status).toBe("needs_times");
    expect(resolution.needsSetup).toBe(true);
    expect(resolution.reviewedName).toBe("Rally Schedule");
    expect(resolution.setupChoice).toBe("add_later");
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
            reviewedName: "Rally Day",
          },
      ]
    );

    expect(resolution.matchedExistingScheduleId).toBe("rally-manual");
    expect(resolution.status).toBe("matched_by_admin");
    expect(resolution.reviewedName).toBe("Rally Day");
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
      expect(normalized.importResult.specialDays[0].endDate).toBe("2026-08-12");
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
      expect(normalized.importResult.noSchoolRanges[0].endDate).toBe("2026-09-07");
      expect(normalized.importResult.warnings).toContainEqual(
        expect.objectContaining({ code: "duplicate_import_item_removed" })
      );
    }
  });

  it("merges nested no-school holidays into canonical coverage and preserves labels", () => {
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({
        firstInstructionalDate: "2026-08-12",
        lastInstructionalDate: "2027-05-28",
        noSchoolRanges: [
          {
            id: "christmas-recess",
            startDate: "2026-12-21",
            endDate: "2027-01-01",
            label: "Christmas Recess",
            type: "Recess",
            confidence: "high",
            evidence: null,
          },
          {
            id: "admission-day",
            startDate: "2026-12-23",
            endDate: null,
            label: "Admission Day",
            type: "Holiday",
            confidence: "high",
            evidence: null,
          },
          {
            id: "christmas-holidays",
            startDate: "2026-12-24",
            endDate: "2026-12-25",
            label: "Christmas Holidays",
            type: "Holiday",
            confidence: "high",
            evidence: null,
          },
          {
            id: "new-years-day",
            startDate: "2027-01-01",
            endDate: null,
            label: "New Year's Day",
            type: "Holiday",
            confidence: "high",
            evidence: null,
          },
        ],
      }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.importResult.noSchoolRanges).toHaveLength(1);
      expect(normalized.importResult.noSchoolRanges[0]).toMatchObject({
        id: "christmas-recess",
        startDate: "2026-12-21",
        endDate: "2027-01-01",
        label: "Christmas Recess",
      });
      expect(normalized.importResult.informationalDates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            date: "2026-12-23",
            label: "Admission Day",
          }),
          expect.objectContaining({
            date: "2026-12-24",
            label: "Christmas Holidays",
          }),
          expect.objectContaining({
            date: "2026-12-25",
            label: "Christmas Holidays",
          }),
          expect.objectContaining({
            date: "2027-01-01",
            label: "New Year's Day",
          }),
        ])
      );
      expect(normalized.importResult.automaticResolutions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "no_school_ranges_merged",
            labelsPreserved: expect.arrayContaining([
              "Christmas Recess",
              "Admission Day",
              "Christmas Holidays",
              "New Year's Day",
            ]),
          }),
        ])
      );
      expect(normalized.importResult.warnings).not.toContainEqual(
        expect.objectContaining({ code: "overlapping_no_school_ranges" })
      );
    }
  });

  it("merges partially overlapping no-school ranges into one coverage range", () => {
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({
        noSchoolRanges: [
          {
            id: "spring-break-a",
            startDate: "2027-03-22",
            endDate: "2027-03-26",
            label: "Easter Recess",
            type: "Recess",
            confidence: "high",
            evidence: null,
          },
          {
            id: "spring-break-b",
            startDate: "2027-03-26",
            endDate: "2027-03-29",
            label: "District Closed",
            type: "Closure",
            confidence: "high",
            evidence: null,
          },
        ],
      }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.importResult.noSchoolRanges).toHaveLength(1);
      expect(normalized.importResult.noSchoolRanges[0]).toMatchObject({
        startDate: "2027-03-22",
        endDate: "2027-03-29",
        label: "Easter Recess",
      });
      expect(normalized.importResult.automaticResolutions).toContainEqual(
        expect.objectContaining({
          code: "no_school_ranges_merged",
          labelsPreserved: ["Easter Recess", "District Closed"],
        })
      );
    }
  });

  it("reclassifies term-ending labels as informational unless no-school is explicit", () => {
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({
        noSchoolRanges: [
          {
            id: "fall-term-ends",
            startDate: "2026-12-18",
            endDate: null,
            label: "Fall Term Ends",
            type: "Important Date",
            confidence: "high",
            evidence: null,
          },
        ],
      }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.importResult.noSchoolRanges).toHaveLength(0);
      expect(normalized.importResult.informationalDates).toContainEqual(
        expect.objectContaining({
          date: "2026-12-18",
          label: "Fall Term Ends",
        })
      );
      expect(normalized.importResult.automaticResolutions).toContainEqual(
        expect.objectContaining({
          code: "term_end_reclassified",
          labelsPreserved: ["Fall Term Ends"],
        })
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

  it("returns schema errors before final review generation for invalid imported dates", () => {
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({
        noSchoolRanges: [
          {
            id: "holiday-1",
            startDate: "2026-99-99",
            endDate: null,
            label: "Broken Holiday",
            type: "Holiday",
            confidence: "review",
            evidence: null,
          },
        ],
      }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(false);
    if (!normalized.success) {
      expect(normalized.errors).toContain("noSchoolRanges.0.startDate must be a YYYY-MM-DD date.");
    }
  });

  it("keeps a referenced pattern schedule for review when GPT omits it from detected schedules", () => {
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({
        detectedSchedules: [],
        normalPattern: {
          type: "same",
          scheduleTempIds: ["sched-allperiods"],
          weekdayMappings: [],
          confidence: "review",
          evidence: null,
        },
      }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.importResult.pattern.scheduleTempIds).toEqual(["sched-allperiods"]);
      expect(normalized.importResult.detectedSchedules[0]).toMatchObject({
        tempId: "sched-allperiods",
        detectedName: "Allperiods",
        confidence: "review",
      });
      expect(normalized.importResult.warnings).toContainEqual(
        expect.objectContaining({ code: "missing_required_schedule_detected" })
      );
    }
  });

  it("reports structured validation details for missing required schedules", () => {
    const result = validateAiCalendarImportResult({
      ...createMockAiCalendarImportResult(),
      pattern: {
        type: "same",
        scheduleTempIds: [],
        confidence: "high",
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: "pattern.scheduleTempIds",
          code: "too_small",
          expected: "at least one schedule temp id",
        })
      );
    }
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

  it("excludes personnel appendix dates from the student calendar", () => {
    const normalized = normalizeAiCalendarExtraction(
      rawExtraction({
        pageClassifications: [
          {
            page: 1,
            role: "student_attendance_calendar",
            confidence: "high",
            evidence: { sourceText: "Student Attendance Calendar", page: 1, explanation: "Title" },
          },
          {
            page: 2,
            role: "personnel_holidays",
            confidence: "high",
            evidence: { sourceText: "Classified Personnel Holidays", page: 2, explanation: "Title" },
          },
        ],
        noSchoolRanges: [
          {
            id: "labor-day",
            startDate: "2026-09-07",
            endDate: "2026-09-07",
            label: "Labor Day",
            type: "holiday",
            confidence: "high",
            evidence: { sourceText: "Labor Day", page: 1, explanation: "Student calendar" },
          },
          {
            id: "staff-holiday",
            startDate: "2027-07-05",
            endDate: "2027-07-05",
            label: "Classified Staff Holiday",
            type: "holiday",
            confidence: "high",
            evidence: { sourceText: "Classified Holiday", page: 2, explanation: "Personnel calendar" },
          },
        ],
        specialSchoolDays: [
          {
            id: "staff-only",
            startDate: "2027-06-18",
            endDate: "2027-06-18",
            label: "Staff Work Day",
            type: "staff",
            scheduleTempId: null,
            isInstructional: false,
            confidence: "high",
            evidence: { sourceText: "Staff Work Day", page: 2, explanation: "Personnel calendar" },
          },
        ],
      }),
      { source: "openai" }
    );

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.importResult.noSchoolRanges).toHaveLength(1);
      expect(normalized.importResult.noSchoolRanges[0].id).toBe("labor-day");
      expect(normalized.importResult.specialDays).toHaveLength(0);
      expect(normalized.importResult.pageClassifications).toContainEqual(
        expect.objectContaining({ page: 2, role: "personnel_holidays" })
      );
      expect(normalized.importResult.warnings).toContainEqual(
        expect.objectContaining({ code: "out_of_scope_page_dates_removed" })
      );
    }
  });
});

describe("OpenAI calendar analyzer behavior", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a gpt-5 Responses API request without temperature", () => {
    const request = buildCalendarImportResponsesRequest("gpt-5", "file_123");

    expect(request).toMatchObject({
      model: "gpt-5",
      store: false,
      text: {
        format: {
          type: "json_schema",
          strict: true,
        },
      },
    });
    expect(JSON.stringify(request)).toContain("file_123");
    expect(JSON.stringify(request)).toContain("pageClassifications");
    expect(request.instructions).toContain("personnel holiday pages");
    expect("temperature" in request).toBe(false);
  });

  it("builds a gpt-5 mini text request with low reasoning and strict JSON schema", () => {
    const request = buildCalendarImportTextResponsesRequest(
      "gpt-5-mini",
      "[PAGE 1]\nAugust 12 Instruction Begins"
    );

    expect(request).toMatchObject({
      model: "gpt-5-mini",
      store: false,
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          strict: true,
        },
      },
    });
    expect(JSON.stringify(request)).toContain("[PAGE 1]");
    expect(JSON.stringify(request)).toContain("pageClassifications");
    expect(request.instructions).toContain("classify each [PAGE n]");
    expect("temperature" in request).toBe(false);
  });

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
    expect(result).toMatchObject({
      status: "configuration_error",
      reasonCode: "openai_authentication_failed",
    });
  });

  it("maps post-analysis processing failures to safe reason codes", () => {
    const result = mapOpenAiError(
      new AiCalendarImportProcessingError({
        phase: "review_generation",
        reasonCode: "review_generation_failed",
        message: "review failed",
      })
    );

    expect(result).toMatchObject({
      status: "analysis_failed",
      reasonCode: "review_generation_failed",
      retryable: true,
    });
  });

  it("reports missing OpenAI API key as a safe configuration reason", () => {
    const config = getOpenAiCalendarConfiguration({
      AI_CALENDAR_IMPORT_MODE: "openai",
      OPENAI_API_KEY: "",
      OPENAI_CALENDAR_MODEL: "gpt-5",
    });

    expect(config).toMatchObject({
      ok: false,
      reasonCode: "missing_openai_api_key",
    });
    expect(JSON.stringify(config)).not.toContain("OPENAI_API_KEY");
  });

  it("reports disabled AI calendar import mode as a safe configuration reason", () => {
    const config = getOpenAiCalendarConfiguration({
      AI_CALENDAR_IMPORT_MODE: "disabled",
      OPENAI_API_KEY: "sk-test",
      OPENAI_CALENDAR_MODEL: "gpt-5",
    });

    expect(config).toMatchObject({
      ok: false,
      reasonCode: "import_mode_disabled",
    });
  });

  it("uses separate text and PDF model environment precedence", () => {
    expect(getOpenAiCalendarTextModel({})).toBe("gpt-5-mini");
    expect(getOpenAiCalendarTextModel({ OPENAI_CALENDAR_TEXT_MODEL: "custom-mini" })).toBe("custom-mini");
    expect(getOpenAiCalendarPdfModel({})).toBe("gpt-5");
    expect(getOpenAiCalendarPdfModel({ OPENAI_CALENDAR_MODEL: "legacy-pdf" })).toBe("legacy-pdf");
    expect(
      getOpenAiCalendarPdfModel({
        OPENAI_CALENDAR_MODEL: "legacy-pdf",
        OPENAI_CALENDAR_PDF_MODEL: "custom-pdf",
      })
    ).toBe("custom-pdf");
  });

  it("builds sanitized OpenAI error diagnostics", () => {
    const error = new AuthenticationError(401, {}, "bad key", new Headers());
    const diagnostics = buildOpenAiErrorDiagnostics(error, {
      model: "gpt-5",
      stage: "creating_response",
      fileUploadSucceeded: true,
      responsesApiCallBegan: true,
      durationMs: 1234,
    });

    expect(diagnostics).toMatchObject({
      constructorName: "AuthenticationError",
      status: 401,
      model: "gpt-5",
      stage: "creating_response",
      fileUploadSucceeded: true,
      responsesApiCallBegan: true,
      durationMs: 1234,
    });
    expect(diagnostics.message).toBeTruthy();
    expect(JSON.stringify(diagnostics)).not.toContain("OPENAI_API_KEY");
    expect(JSON.stringify(diagnostics)).not.toContain("%PDF-");
  });

  it("maps rate-limit errors safely", () => {
    const result = mapOpenAiError(new RateLimitError(429, {}, "rate limit", new Headers()));
    expect(result).toMatchObject({ status: "rate_limited", retryable: true });
  });

  it("maps timeout errors safely", () => {
    const result = mapOpenAiError(new APIConnectionTimeoutError({ message: "timeout" }));
    expect(result).toMatchObject({ status: "analysis_failed", retryable: true });
  });

  it("maps PDF preparation failures safely", async () => {
    const { OpenAiCalendarPdfPreparationError } = await import(
      "./openAiCalendarAnalyzerUtils"
    );
    const result = mapOpenAiError(new OpenAiCalendarPdfPreparationError());

    expect(result).toMatchObject({ status: "analysis_failed", retryable: true });
    if (result.status === "success") throw new Error("Expected failure result");
    expect(result.message).toContain("read this PDF");
  });

  it("uses a 3-minute default application timeout", () => {
    expect(parseOpenAiCalendarTimeoutMs(undefined)).toBe(DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS);
  });

  it("keeps the route import budget below Vercel max duration", () => {
    expect(AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS).toBe(270_000);
    expect(AI_IMPORT_ROUTE_RESPONSE_RESERVE_MS).toBe(30_000);
    expect(AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS + AI_IMPORT_ROUTE_RESPONSE_RESERVE_MS).toBe(300_000);
    expect(AI_IMPORT_MIN_PDF_FALLBACK_BUDGET_MS).toBe(155_000);
  });

  it("allows PDF fallback only when the minimum fallback budget remains", () => {
    expect(hasAiImportPdfFallbackBudget(115_000)).toBe(true);
    expect(hasAiImportPdfFallbackBudget(115_001)).toBe(false);
  });

  it("accepts a valid application timeout override", () => {
    expect(parseOpenAiCalendarTimeoutMs("120000")).toBe(120_000);
  });

  it("falls back for invalid application timeout overrides", () => {
    expect(parseOpenAiCalendarTimeoutMs("not-a-number")).toBe(DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS);
    expect(parseOpenAiCalendarTimeoutMs("-1")).toBe(DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS);
    expect(parseOpenAiCalendarTimeoutMs("Infinity")).toBe(DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS);
  });

  it("clamps application timeout overrides to the supported range", () => {
    expect(parseOpenAiCalendarTimeoutMs("1000")).toBe(MIN_OPENAI_CALENDAR_TIMEOUT_MS);
    expect(parseOpenAiCalendarTimeoutMs("999999")).toBe(MAX_OPENAI_CALENDAR_TIMEOUT_MS);
  });

  it("aborts at the configured application timeout", () => {
    vi.useFakeTimers();
    const timeout = createOpenAiCalendarTimeoutController(120_000);

    expect(timeout.controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(119_999);
    expect(timeout.controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);

    expect(timeout.controller.signal.aborted).toBe(true);
    expect(timeout.timedOut).toBe(true);
    expect(timeout.controller.signal.reason).toBeInstanceOf(OpenAiCalendarApplicationTimeoutError);
    timeout.clear();
  });

  it("maps application timeout errors to the safe client message", () => {
    const result = mapOpenAiError(new OpenAiCalendarApplicationTimeoutError(180_000));

    expect(result).toMatchObject({
      status: "analysis_failed",
      message: "The calendar analysis took too long to complete. Retry, or continue manually.",
      retryable: true,
      reasonCode: "openai_timeout",
    });
    expect(shouldRetryOpenAiError(new OpenAiCalendarApplicationTimeoutError(180_000), 0)).toBe(false);
  });

  it("cleans up application timeout timers", () => {
    vi.useFakeTimers();
    const timeout = createOpenAiCalendarTimeoutController(45_000);

    timeout.clear();
    vi.advanceTimersByTime(45_000);

    expect(timeout.controller.signal.aborted).toBe(false);
    expect(timeout.timedOut).toBe(false);
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

  it("keeps unresolved schedule IDs visible when converting into the advanced manual wizard", () => {
    const result = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(result.detectedSchedules, []);
    const converted = convertAiImportToWizardDraft(baseDraft(), result, resolutions);

    expect(converted.unresolvedRequiredScheduleIds.length).toBeGreaterThan(0);
    expect(unresolvedRequiredSchedulesBlockFinalReadiness(converted.draft)).toBe(true);
    expect(converted.earliestStep).toBe("school-year");
  });

  it("treats Add Times Later as quick-setup ready even when bell times are missing", () => {
    const result = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(result.detectedSchedules, []);
    const readiness = getAiImportReadinessSummary({
      importResult: result,
      resolutions: resolutions.map((resolution) => ({
        ...resolution,
        setupChoice: "add_later",
      })),
      completedSteps: ["school-year", "no-school", "special-days", "review"],
    });

    expect(readiness.remainingTasks).not.toContain("Add times");
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
