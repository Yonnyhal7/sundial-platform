import { describe, expect, it } from "vitest";
import {
  buildAiCalendarDebugSnapshot,
  hasAiCalendarDebugPresentationMismatch,
} from "./aiCalendarDebug";
import { buildAiPreviewConfig } from "./aiImportPreview";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import { normalizeAndDeduplicateReviewIssues } from "./aiQuickSetupPersistence";

describe("AI Calendar Debug safe snapshot", () => {
  it("detects a legacy visible blocker divergence", () => {
    expect(hasAiCalendarDebugPresentationMismatch({
      visibleBlockingCardIds: ["legacy-overlap"],
      normalizedBlockingIssueIds: [],
      createDisabledBecauseOfBlockers: false,
    })).toBe(true);
    expect(hasAiCalendarDebugPresentationMismatch({
      visibleBlockingCardIds: [],
      normalizedBlockingIssueIds: [],
      createDisabledBecauseOfBlockers: false,
    })).toBe(false);
  });

  it("reports exact normalized blocker metadata without source-document contents", () => {
    const importResult = createMockAiCalendarImportResult();
    importResult.documentTitle = "PRIVATE PDF CONTENT";
    importResult.noSchoolRanges = [{
      id: "christmas-recess",
      startDate: "2026-12-21",
      endDate: "2027-01-01",
      label: "Christmas Recess",
      type: "Recess",
      confidence: "high",
      evidence: { sourceText: "SECRET EXTRACTED TEXT" },
    }];
    importResult.informationalDates = [{
      id: "admission-day",
      date: "2026-12-23",
      label: "Admission Day (In Lieu)",
      confidence: "high",
      evidence: { sourceText: "API_KEY_SHOULD_NOT_LEAK" },
    }];
    importResult.warnings = [{
      code: "legacy_overlap",
      severity: "blocking",
      message: "SECRET WARNING TEXT: special day overlaps no-school; date remains no school.",
    }];
    const generated = generateSchoolYearCalendar(buildAiPreviewConfig(importResult));
    const classification = normalizeAndDeduplicateReviewIssues({
      importResult,
      generationWarnings: generated.warnings,
      analysisVersion: "calendar-v12",
    });
    const snapshot = buildAiCalendarDebugSnapshot({
      schoolSlug: "del-oro",
      routeRequestId: "request-1",
      importResult,
      generationWarnings: generated.warnings,
      previewDays: generated.days,
      classification,
      metadata: {
        state: "review",
        result: importResult,
        resolutions: [],
        cacheHit: true,
        cacheStrategy: "pdf-gpt5",
        analysisVersion: "calendar-v12",
        analysisAttemptId: "attempt-1",
      },
      restore: {
        restoredFromCache: true,
        restoredFromWizardDraft: true,
        cachedResultVersion: "calendar-v11",
        draftVersion: 1,
        currentAnalysisAttemptId: "attempt-1",
        draftAnalysisAttemptId: "attempt-old",
        staleDraftDetected: true,
      },
    });

    expect(snapshot.counts.rawWarningCount).toBe(1);
    expect(snapshot.counts.unresolvedBlockingCount).toBe(0);
    expect(snapshot.blockerIds).toEqual([]);
    expect(snapshot.issues).toHaveLength(1);
    expect(snapshot.issues[0]).toMatchObject({
      issueCode: "informational_label_inside_no_school",
      severity: "automatically_resolved",
      status: "automatically_resolved",
      sourceLabels: ["Admission Day (In Lieu)", "Christmas Recess"],
      currentClassification: "No school; no schedule assigned; rotation paused",
      cacheState: "cache_hit",
      rotationBehavior: "pause",
      analysisAttemptId: "attempt-1",
    });
    expect(snapshot.issues[0].canonicalIssueKey).toContain("2026-12-23");
    expect(snapshot.issues[0].history.at(-1)).toMatchObject({
      stage: "normalizeReviewIssues",
      severity: "automatically_resolved",
    });

    const exported = JSON.stringify(snapshot);
    expect(exported).not.toContain("PRIVATE PDF CONTENT");
    expect(exported).not.toContain("SECRET EXTRACTED TEXT");
    expect(exported).not.toContain("API_KEY_SHOULD_NOT_LEAK");
    expect(exported).not.toContain("SECRET WARNING TEXT");
    expect(exported).not.toContain("sourceText");
    expect(exported).not.toContain("evidence");
  });
});
