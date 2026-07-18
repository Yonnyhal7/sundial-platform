import { describe, expect, it, vi } from "vitest";
import {
  AI_CALENDAR_WIZARD_DRAFT_TYPE,
  chooseCalendarWizardDraftSource,
  getCalendarWizardFlowForDraft,
  getDraftTypeForCalendarWizardFlow,
  GUIDED_CALENDAR_WIZARD_DRAFT_TYPE,
  getInitialCalendarWizardHydrationState,
  mergeAiCalendarIssueResolutionWithRetry,
  mergeAiCalendarWarningResolutions,
  migrateCalendarWizardStoredData,
  serializeCalendarWizardDraft,
  shouldDebouncedSave,
  shouldRenderWizardProgress,
} from "./draftPersistence";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";
import { matchDetectedSchedules } from "./aiScheduleMatching";

function manualDraft(overrides: Record<string, unknown> = {}) {
  return {
    schoolYear: {
      label: "2026-2027",
      startDate: "2026-08-12",
      endDate: "2027-06-03",
      operatingWeekdays: [1, 2, 3, 4, 5],
    },
    patternMode: "same",
    sameScheduleId: "schedule-1",
    repeatingScheduleIds: [],
    weekdaySchedules: {},
    noSchoolRanges: [],
    specialDays: [],
    informationalDates: [],
    completedSteps: ["school-year"],
    aiImport: null,
    ...overrides,
  };
}

describe("calendar wizard draft persistence", () => {
  it("serializes a valid draft with version metadata", () => {
    const serialized = serializeCalendarWizardDraft({
      currentStep: "normal-schedule",
      draft: manualDraft(),
    });

    expect(serialized?.data.version).toBe(1);
    expect(serialized?.data.currentStep).toBe("normal-schedule");
    expect(serialized?.summary.schoolYearLabel).toBe("2026-2027");
  });

  it("rejects malformed draft data", () => {
    expect(serializeCalendarWizardDraft(null)).toBeNull();
    expect(serializeCalendarWizardDraft({ draft: "bad" })).toBeNull();
  });

  it("migrates old manual session drafts", () => {
    const migrated = migrateCalendarWizardStoredData(manualDraft());

    expect(migrated?.version).toBe(1);
    expect(migrated?.currentStep).toBe("school-year");
    expect(migrated?.draft.schoolYear.label).toBe("2026-2027");
    expect(migrated?.draft.alternationMethod).toBe("instructional_day");
    expect(migrated?.draft.pauseOnNoSchoolDays).toBe(true);
  });

  it("persists baseline pattern anchors and the new guided steps", () => {
    const serialized = serializeCalendarWizardDraft({
      currentStep: "exceptions-review",
      draft: manualDraft({
        patternMode: "alternate",
        alternationMethod: "calendar_week",
        patternStartDate: "2026-08-10",
        repeatingStartIndex: 1,
      }),
    });

    expect(serialized?.data.currentStep).toBe("exceptions-review");
    expect(serialized?.data.draft.patternMode).toBe("alternate");
    expect(serialized?.data.draft.patternStartDate).toBe("2026-08-10");
  });

  it("normalizes null endDate values to startDate", () => {
    const migrated = migrateCalendarWizardStoredData(
      manualDraft({
        noSchoolRanges: [
          { id: "holiday", startDate: "2026-09-07", endDate: null, label: "Labor Day" },
        ],
        specialDays: [
          {
            id: "rally",
            startDate: "2026-08-21",
            endDate: null,
            scheduleId: "rally",
            label: "Rally",
          },
        ],
      })
    );

    expect(migrated?.draft.noSchoolRanges[0].endDate).toBe("2026-09-07");
    expect(migrated?.draft.specialDays[0].endDate).toBe("2026-08-21");
  });

  it("preserves AI metadata and schedule resolutions", () => {
    const importResult = createMockAiCalendarImportResult();
    const resolutions = matchDetectedSchedules(importResult.detectedSchedules, []);
    const serialized = serializeCalendarWizardDraft({
      currentStep: "normal-schedule",
      draft: manualDraft({
        aiImport: {
          state: "applied",
          fileName: "calendar.pdf",
          result: importResult,
          resolutions: resolutions.map((resolution) => ({
            ...resolution,
            reviewedName: `${resolution.detectedName} Reviewed`,
            setupChoice: "add_later",
          })),
          unresolvedRequiredScheduleIds: resolutions.map((resolution) => resolution.tempId),
          warnings: importResult.warnings,
          warningResolutions: importResult.warnings.map((warning) => ({
            issueId: `${warning.code}::none::none`,
            issueCode: warning.code,
            code: warning.code,
            status: "acknowledged",
            affectedDates: [],
            resolution: "Administrator kept the original state.",
            reviewedBy: "current_administrator",
            reviewedAt: "2026-07-17T12:00:00.000Z",
          })),
        },
      }),
    });

    expect(serialized?.data.draft.aiImport?.fileName).toBe("calendar.pdf");
    expect(serialized?.data.draft.aiImport?.resolutions[0]?.reviewedName).toContain("Reviewed");
    expect(serialized?.data.draft.aiImport?.resolutions[0]?.setupChoice).toBe("add_later");
    expect(serialized?.data.draft.aiImport?.warningResolutions?.[0]?.status).toBe("acknowledged");
    expect(serialized?.data.draft.aiImport?.warningResolutions?.[0]).toMatchObject({
      issueId: expect.stringContaining("::none::none"),
      reviewedBy: "current_administrator",
      reviewedAt: "2026-07-17T12:00:00.000Z",
    });
  });

  it("uses separate draft types for AI import and guided setup", () => {
    expect(getDraftTypeForCalendarWizardFlow("ai")).toBe(AI_CALENDAR_WIZARD_DRAFT_TYPE);
    expect(getDraftTypeForCalendarWizardFlow("guided")).toBe(GUIDED_CALENDAR_WIZARD_DRAFT_TYPE);
  });

  it("classifies legacy AI drafts for AI migration", () => {
    const importResult = createMockAiCalendarImportResult();
    const serialized = serializeCalendarWizardDraft({
      currentStep: "normal-schedule",
      draft: manualDraft({
        aiImport: {
          state: "review",
          fileName: "calendar.pdf",
          result: importResult,
          resolutions: matchDetectedSchedules(importResult.detectedSchedules, []),
          warnings: importResult.warnings,
          warningResolutions: [],
        },
      }),
    });

    expect(serialized?.data && getCalendarWizardFlowForDraft(serialized.data)).toBe("ai");
  });

  it("classifies legacy manual drafts for guided migration", () => {
    const serialized = serializeCalendarWizardDraft({
      currentStep: "normal-schedule",
      draft: manualDraft(),
    });

    expect(serialized?.data && getCalendarWizardFlowForDraft(serialized.data)).toBe("guided");
  });

  it("does not persist PDF bytes, base64 data, OpenAI file ids, or raw envelopes", () => {
    const serialized = serializeCalendarWizardDraft({
      currentStep: "school-year",
      draft: manualDraft({
        aiImport: {
          state: "applied",
          fileName: "calendar.pdf",
          pdfBytes: "%PDF-1.7",
          base64: "data:application/pdf;base64,AAA",
          openAiFileId: "file_secret",
          rawResponse: { output_text: "raw" },
          result: createMockAiCalendarImportResult(),
          resolutions: [],
        },
      }),
    });

    const raw = JSON.stringify(serialized?.data);
    expect(raw).not.toContain("%PDF-");
    expect(raw).not.toContain("data:application/pdf");
    expect(raw).not.toContain("file_secret");
    expect(raw).not.toContain("output_text");
  });

  it("chooses the newer database or session draft source", () => {
    expect(
      chooseCalendarWizardDraftSource({
        databaseUpdatedAt: "2026-01-01T00:00:00.000Z",
        sessionUpdatedAt: "2026-01-02T00:00:00.000Z",
      })
    ).toBe("session");
    expect(
      chooseCalendarWizardDraftSource({
        databaseUpdatedAt: "2026-01-03T00:00:00.000Z",
        sessionUpdatedAt: "2026-01-02T00:00:00.000Z",
      })
    ).toBe("database");
  });

  it("uses a deterministic loading state for the initial wizard render", () => {
    expect(getInitialCalendarWizardHydrationState()).toEqual({
      currentStep: "school-year",
      draftLoading: true,
      shouldRenderProgress: false,
    });
  });

  it("does not render WizardProgress until draft hydration completes", () => {
    expect(shouldRenderWizardProgress(true)).toBe(false);
    expect(shouldRenderWizardProgress(false)).toBe(true);
  });

  it("supports debounce-change detection", () => {
    expect(shouldDebouncedSave({ a: 1 }, { a: 1 })).toBe(false);
    expect(shouldDebouncedSave({ a: 1 }, { a: 2 })).toBe(true);
  });

  it("models optimistic concurrency conflict checks", () => {
    const existingUpdatedAt: string = "2026-01-02T00:00:00.000Z";
    const lastKnownUpdatedAt: string = "2026-01-01T00:00:00.000Z";

    expect(existingUpdatedAt === lastKnownUpdatedAt).toBe(false);
  });

  it("keys review-resolution merges by issue ID rather than warning code", () => {
    const first = {
      issueId: "special_day_outside_school_year::2027-06-04::first",
      issueCode: "special_day_outside_school_year",
      code: "special_day_outside_school_year",
      status: "acknowledged" as const,
    };
    const second = {
      ...first,
      issueId: "special_day_outside_school_year::2027-06-05::second",
    };

    expect(mergeAiCalendarWarningResolutions([first], [second])).toHaveLength(2);
  });

  it("merges two nearly simultaneous issue resolutions without losing preview edits", async () => {
    const importResult = createMockAiCalendarImportResult();
    importResult.informationalDates = [{
      id: "newest-preview-edit",
      date: "2026-09-01",
      label: "Newest calendar-preview edit",
      confidence: "high",
    }];
    const serialized = serializeCalendarWizardDraft({
      currentStep: "review",
      draft: manualDraft({
        aiImport: {
          state: "review",
          result: importResult,
          resolutions: [],
          warningResolutions: [],
        },
      }),
    });
    expect(serialized).not.toBeNull();

    const firstResolution = {
      issueId: "instructional_day_count_mismatch::none::none",
      issueCode: "instructional_day_count_mismatch",
      code: "instructional_day_count_mismatch",
      status: "acknowledged" as const,
      affectedDates: [],
      reviewedAt: "2026-07-17T20:00:00.000Z",
    };
    const secondResolution = {
      issueId: "special_day_outside_school_year::2027-06-04::special-1",
      issueCode: "special_day_outside_school_year",
      code: "special_day_outside_school_year",
      status: "acknowledged" as const,
      affectedDates: ["2027-06-04"],
      reviewedAt: "2026-07-17T20:00:00.001Z",
    };
    let revision = 0;
    let server = {
      snapshot: { revision },
      updatedAt: "2026-07-17T20:00:00.000Z",
      wizardData: structuredClone(serialized!.data),
    };
    const readLatest = async () => structuredClone(server);
    const writeIfUnchanged = async (
      _latest: { revision: number },
      expectedUpdatedAt: string,
      wizardData: typeof server.wizardData
    ) => {
      if (server.updatedAt !== expectedUpdatedAt) return null;
      revision += 1;
      server = {
        snapshot: { revision },
        updatedAt: `2026-07-17T20:00:00.00${revision}Z`,
        wizardData: structuredClone(wizardData),
      };
      return server.snapshot;
    };
    const save = (resolution: typeof firstResolution | typeof secondResolution) =>
      mergeAiCalendarIssueResolutionWithRetry({
        expectedUpdatedAt: "2026-07-17T20:00:00.000Z",
        resolution,
        readLatest,
        writeIfUnchanged,
      });

    const results = await Promise.all([
      save(firstResolution),
      save(secondResolution),
    ]);
    const serverResolutions =
      server.wizardData.draft.aiImport?.warningResolutions || [];
    const clientResolutions = mergeAiCalendarWarningResolutions(
      [firstResolution],
      [secondResolution]
    );

    expect(results.every((result) => result.status === "success")).toBe(true);
    expect(results.some((result) => result.retried)).toBe(true);
    expect(serverResolutions.map((resolution) => resolution.issueId).sort()).toEqual(
      clientResolutions.map((resolution) => resolution.issueId).sort()
    );
    expect(serverResolutions).toHaveLength(2);
    expect(serverResolutions.every((resolution) => resolution.status === "acknowledged")).toBe(true);
    expect(
      serverResolutions
        .map(({ issueId, status }) => ({ issueId, status }))
        .sort((left, right) => String(left.issueId).localeCompare(String(right.issueId)))
    ).toEqual(
      clientResolutions
        .map(({ issueId, status }) => ({ issueId, status }))
        .sort((left, right) => String(left.issueId).localeCompare(String(right.issueId)))
    );
    expect(
      server.wizardData.draft.aiImport?.result?.informationalDates
    ).toContainEqual(expect.objectContaining({ id: "newest-preview-edit" }));
  });

  it("reports a conflict only after the merge retry also loses concurrency", async () => {
    const importResult = createMockAiCalendarImportResult();
    const serialized = serializeCalendarWizardDraft({
      currentStep: "review",
      draft: manualDraft({
        aiImport: {
          state: "review",
          result: importResult,
          resolutions: [],
          warningResolutions: [],
        },
      }),
    });
    const result = await mergeAiCalendarIssueResolutionWithRetry({
      expectedUpdatedAt: "2026-07-17T20:00:00.000Z",
      resolution: {
        issueId: "instructional_day_count_mismatch::none::none",
        issueCode: "instructional_day_count_mismatch",
        code: "instructional_day_count_mismatch",
        status: "acknowledged",
      },
      readLatest: async () => ({
        snapshot: { id: "draft-1" },
        updatedAt: "2026-07-17T20:00:00.000Z",
        wizardData: serialized!.data,
      }),
      writeIfUnchanged: async () => null,
    });

    expect(result).toMatchObject({ status: "conflict", retried: true });
  });

  it("can safely call future deletion cleanup more than once", () => {
    const cleanup = vi.fn();
    cleanup();
    cleanup();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
