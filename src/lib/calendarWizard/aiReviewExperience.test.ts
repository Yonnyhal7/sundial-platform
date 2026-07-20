import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_CALENDAR_ANALYSIS_VERSION,
  AI_CALENDAR_REVIEW_ISSUE_SCHEMA_VERSION,
} from "./aiCalendarAnalysisVersion";

const source = readFileSync(
  resolve(process.cwd(), "src/app/[school]/admin/calendar/wizard/schedule-wizard-client.tsx"),
  "utf8"
);
const review = source.slice(source.indexOf("function AiImportReview("), source.indexOf("function AiImportedCalendarPreview("));
const preview = source.slice(source.indexOf("function AiImportedCalendarPreview("), source.indexOf("function ReviewPanel("));
const modal = source.slice(source.indexOf("function AiCreateCalendarModal("), source.indexOf("function CompletionScreen("));

describe("AI calendar review experience", () => {
  it("renders one shared calendar preview without a duplicate verification grid", () => {
    expect((preview.match(/<SchoolCalendarMonthGrid/g) || [])).toHaveLength(1);
    expect(preview).not.toContain("Assignment Verification");
  });

  it("places the instructional count review in the shared preview with selectable flagged dates", () => {
    expect(preview).toContain("Instructional-Day Count Review");
    expect(preview).toContain("PDF-declared count");
    expect(preview).toContain("Current preview count");
    expect(preview).toContain("setSelectedDate(item.date)");
    expect(preview).toContain("staff_only");
    expect(preview).toContain("neutral_non_operating");
    expect(preview).toContain("removed_from_coverage");
  });

  it("keeps Create Calendar only in final actions below readiness", () => {
    expect((review.match(/>\s*Create Calendar\s*</g) || [])).toHaveLength(1);
    expect(review.indexOf("Readiness Checklist")).toBeLessThan(review.indexOf("Create Calendar"));
    expect(review.indexOf("data-ai-review-final-actions")).toBeLessThan(review.indexOf("Create Calendar"));
  });

  it("confirms remaining nonblocking notes without forcing another edit", () => {
    expect(modal).toContain("Create calendar with review notes?");
    expect(modal).toContain("Final instructional count");
    expect(modal).toContain("Dates left for later");
    expect(modal).toContain("Return to Review");
    expect(modal).not.toContain("reviewAcknowledged");
  });

  it("uses the four readiness groups and reserves blocking for required issues", () => {
    expect(source).toContain('{ title: "Ready", status: "ready" as const }');
    expect(source).toContain('{ title: "Reviewed", status: "reviewed" as const }');
    expect(source).toContain('{ title: "Complete later", status: "complete_later" as const }');
    expect(source).toContain('{ title: "Blocked", status: "blocked" as const }');
    expect(source).toContain("Ready with ${reviewNoteCount} review note");
    expect(source).toContain("Blocked by ${blockingIssueCount} required issue");
  });

  it("links warning actions to the exact preview date and reevaluates after save", () => {
    expect(review).toContain("setPreviewIssueRequest");
    expect(review).toContain("editWarningManually");
    expect(review).toContain('key={previewIssueRequest?.requestId || "calendar-preview"}');
    expect(preview).toContain("issueRequest?.date ||");
    expect(preview).toContain("scrollIntoView");
    expect(preview).toContain("classificationControlRef.current?.focus()");
    expect(preview).toContain("issueRemains");
    expect(preview).toContain("onIssueSave(issueRequest.issueId, !issueRemains)");
  });

  it("renders exact overlap details and unresolved-only action controls", () => {
    expect(review).toContain("getCalendarWarningDateDetails(importResult, warning)");
    expect(review).toContain("Current classification:");
    expect(review).toContain("Sundial will:");
    expect(review).toContain("Automatically resolved · Safe for calendar creation.");
    expect(review).toContain('warning.status === "unresolved"');
  });

  it("renders centralized issue-specific actions without generic labels", () => {
    expect(review).toContain("buildAiReviewCardViewModel");
    expect(review).toContain("card.actions.map");
    expect(review).not.toContain(["Use", "suggested correction"].join(" "));
    expect(review).not.toContain(["Keep", "original"].join(" "));
    expect(review).not.toContain("Edit manually");
  });

  it("renders warning sections only from the final normalized issue collection", () => {
    expect(review).toContain("const finalReviewIssues = finalReviewIssueCollection.issues");
    expect(review).toContain("groupFinalReviewIssues(finalReviewIssues)");
    expect(review).toContain("const blockingWarnings = finalIssueGroups.blocking");
    expect(review).not.toContain("automaticResolutions.map");
    expect(review).not.toContain("warningReadiness");
    expect(review).not.toContain("blockingIssueIds");
  });

  it("uses the exact normalized create-disabled inputs", () => {
    expect(review).toContain("isAiCalendarCreateDisabled({");
    expect(review).toContain("requiredAcknowledgmentsMissing,");
    expect(review).toContain("previewDigestMismatch,");
    expect(review).toContain("creationInProgress,");
    expect(review).toContain("disabled={createDisabled}");
  });

  it("removes the special-day category and derives summary counts from the preview", () => {
    expect(review).not.toContain("Special School Days");
    expect(review).not.toContain("Special Schedule Days");
    expect(review).not.toContain("Special schedule days");
    expect(review).toContain("previewResult.summary.instructionalDayCount");
    expect(review).toContain("previewResult.summary.noSchoolWeekdayCount");
  });

  it("orders the simplified review sections correctly", () => {
    const labels = ["Import Summary", 'title="Detected Schedules"', 'title="Warnings"', 'title="No-School Days"', "<AiImportedCalendarPreview", 'title="Readiness Checklist"'];
    const positions = labels.map((label) => review.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("invalidates older review caches when deterministic page selection changes", () => {
    expect(AI_CALENDAR_ANALYSIS_VERSION).toBe("calendar-v13-page-selection-v1");
    expect(AI_CALENDAR_REVIEW_ISSUE_SCHEMA_VERSION).toBe(3);
    const cacheSource = readFileSync(resolve(process.cwd(), "src/lib/calendarWizard/aiCalendarAnalysisCache.server.ts"), "utf8");
    expect(cacheSource).toContain("AI_CALENDAR_ANALYSIS_VERSION");
    expect(cacheSource).toContain('.eq("analysis_version", key.version)');
    expect(source).toContain("migrateLegacyAiImportMetadata");
    expect(source).toContain("restoredNeedsMigration");
    expect(source).toContain("replaceAiImportWithFreshAnalysis");
    expect(source).toContain("issueSchemaVersion: AI_CALENDAR_REVIEW_ISSUE_SCHEMA_VERSION");
  });
});
