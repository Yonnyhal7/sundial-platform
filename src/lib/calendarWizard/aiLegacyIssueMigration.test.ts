import { describe, expect, it } from "vitest";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";
import type { AiImportDraftMetadata } from "./aiImportTypes";
import {
  migrateLegacyAiImportMetadata,
  replaceAiImportWithFreshAnalysis,
  normalizeUnknownScheduleReferences,
} from "./aiLegacyIssueMigration";
import { classifyCalendarWarnings, normalizeAndDeduplicateReviewIssues } from "./aiQuickSetupPersistence";
import { migrateCalendarWizardStoredData, serializeCalendarWizardDraft } from "./draftPersistence";
import { AI_CALENDAR_CACHE_KEY_VERSION } from "./aiCalendarAnalysisVersion";

function legacyMetadata(): AiImportDraftMetadata {
  const result = createMockAiCalendarImportResult();
  result.detectedSchedules = [{
    tempId: "regular-real",
    detectedName: "Regular Schedule",
    normalizedName: "regular",
    category: "regular",
    confidence: "high",
    needsSetup: false,
  }];
  result.pattern = { type: "same", scheduleTempIds: ["regular-real"], confidence: "high" };
  result.warnings = [{
    code: "unknown_pattern_schedule_reference",
    severity: "blocking",
    message: "Sundial assigned standard instructional days to the regular schedule.",
  }];
  return {
    state: "review",
    result,
    resolutions: [{
      tempId: "regular-real",
      detectedName: "Regular Schedule",
      normalizedName: "regular",
      matchedExistingScheduleId: "existing-regular",
      status: "matched_automatically",
      needsSetup: false,
    }],
    warnings: result.warnings,
    warningResolutions: [{
      issueId: "unknown_pattern_schedule_reference::none::none",
      issueCode: "unknown_pattern_schedule_reference",
      code: "unknown_pattern_schedule_reference",
      status: "unresolved",
    }],
    analysisVersion: "calendar-v12",
    issueSchemaVersion: 1,
  };
}

describe("legacy AI calendar issue migration", () => {
  it("repairs the exact persisted calendar-v12 blocker shape", () => {
    const migrated = migrateLegacyAiImportMetadata(legacyMetadata());
    expect(migrated.changed).toBe(true);
    expect(migrated.metadata.analysisVersion).toBe("calendar-v13-page-selection-v1");
    expect(migrated.metadata.warnings).toEqual([{
      code: "unknown_pattern_schedule_reference",
      severity: "info",
      message: "Sundial assigned standard instructional days to the regular schedule.",
    }]);
    expect(migrated.metadata.warningResolutions).toEqual([]);
    const classified = classifyCalendarWarnings(migrated.metadata.warnings);
    expect(classified.blockingWarnings).toEqual([]);
    expect(classified.automaticallyResolvedWarnings[0]).toMatchObject({
      finalSeverity: "automatically_resolved",
      finalStatus: "automatically_resolved",
      resolved: true,
    });
    expect(migrated.diagnostics.migratedIssueCodes).toEqual(["unknown_pattern_schedule_reference"]);
  });

  it("repairs repeatedly without restoring the blocker", () => {
    const first = migrateLegacyAiImportMetadata(legacyMetadata()).metadata;
    const repeated = migrateLegacyAiImportMetadata(first);
    const second = repeated.metadata;
    expect(repeated.changed).toBe(false);
    expect(classifyCalendarWarnings(second.warnings).blockingWarnings).toEqual([]);
  });

  it("preserves valid explicit user resolutions during version migration", () => {
    const metadata = legacyMetadata();
    metadata.result!.warnings.push({ code: "instructional_day_count_mismatch", severity: "review", message: "Review count." });
    metadata.warningResolutions!.push({
      issueId: "instructional_day_count_mismatch::none::none",
      issueCode: "instructional_day_count_mismatch",
      code: "instructional_day_count_mismatch",
      status: "acknowledged",
      reviewedBy: "administrator",
      reviewedAt: "2026-07-19T00:00:00.000Z",
    });
    const migrated = migrateLegacyAiImportMetadata(metadata);
    expect(migrated.metadata.warningResolutions).toContainEqual(expect.objectContaining({
      code: "instructional_day_count_mismatch",
      status: "acknowledged",
    }));
  });

  it("fresh analysis replaces stale analyzer warnings and resolutions", () => {
    const freshResult = createMockAiCalendarImportResult();
    freshResult.warnings = [];
    const replaced = replaceAiImportWithFreshAnalysis(legacyMetadata(), {
      state: "review",
      result: freshResult,
      resolutions: [],
      warnings: [],
      warningResolutions: [],
    });
    expect(replaced.warnings).toEqual([]);
    expect(replaced.warningResolutions).toEqual([]);
    expect(replaced.result?.warnings).toEqual([]);
  });

  it("keeps genuinely named unknown schedules blocking", () => {
    const metadata = legacyMetadata();
    metadata.result!.warnings = [{
      code: "unknown_pattern_schedule_reference",
      severity: "blocking",
      message: "The PDF referenced a normal pattern schedule that was not listed: Assembly.",
    }];
    metadata.warnings = metadata.result!.warnings;
    const migrated = migrateLegacyAiImportMetadata(metadata);
    expect(classifyCalendarWarnings(migrated.metadata.warnings).blockingWarnings).toHaveLength(1);
  });

  it("repairs existing saved drafts at hydration and serialization boundaries", () => {
    const stored = {
      version: 1,
      currentStep: "review",
      savedAt: "2026-07-19T00:00:00.000Z",
      draft: {
        schoolYear: { label: "2026-2027", startDate: "2026-08-01", endDate: "2027-06-01", operatingWeekdays: [1, 2, 3, 4, 5] },
        normalPattern: { type: "same", scheduleId: "regular-real" },
        noSchoolRanges: [], specialDays: [], informationalDates: [], completedSteps: [],
        aiImport: legacyMetadata(),
      },
    };
    const hydrated = migrateCalendarWizardStoredData(stored);
    expect(hydrated?.draft.aiImport?.analysisVersion).toBe("calendar-v13-page-selection-v1");
    expect(classifyCalendarWarnings(hydrated?.draft.aiImport?.warnings).blockingWarnings).toEqual([]);
    const serialized = serializeCalendarWizardDraft(hydrated);
    expect(serialized?.data.draft.aiImport?.warningResolutions).toEqual([]);
  });

  it("removes the exact empty v13 cache-hit issue before review normalization", () => {
    const result = legacyMetadata().result!;
    result.warnings = [({
      code: "unknown_pattern_schedule_reference",
      severity: "blocking",
      message: "A normal pattern schedule reference could not be resolved.",
      scheduleIds: [], scheduleKeys: [], sourceLabels: [], dates: [],
    } as typeof result.warnings[number])];
    const canonical = normalizeUnknownScheduleReferences(result);
    expect(canonical.changed).toBe(true);
    expect(canonical.result.warnings).toEqual([]);
    const review = normalizeAndDeduplicateReviewIssues({
      importResult: result,
      analysisVersion: "calendar-v13-page-selection-v1",
    });
    expect(review.blockingWarnings).toEqual([]);
    expect(review.canCreateCalendar).toBe(true);
  });

  it.each([
    "The PDF referenced a normal pattern schedule that was not listed: Assembly.",
    "The PDF referenced a normal pattern schedule that was not listed: Rally.",
    "The PDF referenced a normal pattern schedule that was not listed: Minimum Day.",
  ])("keeps a concrete external reference blocking: %s", (message) => {
    const result = legacyMetadata().result!;
    result.warnings = [{ code: "unknown_pattern_schedule_reference", severity: "blocking", message }];
    expect(normalizeUnknownScheduleReferences(result).result.warnings).toHaveLength(1);
    expect(normalizeAndDeduplicateReviewIssues({ importResult: result }).blockingWarnings).toHaveLength(1);
  });

  it("keeps an external schedule issue with affected dates blocking", () => {
    const result = legacyMetadata().result!;
    result.warnings = [({
      code: "unknown_pattern_schedule_reference", severity: "blocking",
      message: "A schedule reference could not be resolved.", dates: ["2026-09-01"],
    } as typeof result.warnings[number])];
    expect(normalizeUnknownScheduleReferences(result).result.warnings).toHaveLength(1);
  });

  it("versions cache policy independently from the analyzer", () => {
    expect(AI_CALENDAR_CACHE_KEY_VERSION).toContain("calendar-v13-page-selection-v1");
    expect(AI_CALENDAR_CACHE_KEY_VERSION).toContain("cache-schema-v2");
    expect(AI_CALENDAR_CACHE_KEY_VERSION).toContain("issue-normalization-v2");
  });
});
