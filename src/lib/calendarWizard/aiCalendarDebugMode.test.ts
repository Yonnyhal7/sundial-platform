import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "src/app/[school]/admin/calendar/wizard/ai/page.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");
const client = readFileSync(
  resolve(process.cwd(), "src/app/[school]/admin/calendar/wizard/schedule-wizard-client.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");
const panel = readFileSync(
  resolve(process.cwd(), "src/app/[school]/admin/calendar/wizard/ai-calendar-debug-panel.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");
const actions = readFileSync(
  resolve(process.cwd(), "src/app/[school]/admin/calendar/wizard/actions.ts"),
  "utf8"
).replace(/\r\n/g, "\n");

describe("temporary AI Calendar Debug Mode", () => {
  it("uses a server-only environment flag after the authorized page load", () => {
    expect(page).toContain('process.env.AI_CALENDAR_DEBUG === "true"');
    expect(page).not.toContain("NEXT_PUBLIC_AI_CALENDAR_DEBUG");
    expect(actions).toContain("if (!aiCalendarDebugEnabled())");
    expect(actions).toContain("getCalendarDraftSchoolContext(school)");
    expect(actions).toContain('.eq("school_id", schoolData.id)');
    expect(actions).toContain(
      "getUnresolvedBlockingReviewIssues(\n      finalWarningClassification.issues"
    );
    expect(client).toContain(
      "getUnresolvedBlockingReviewIssues(finalReviewIssues)"
    );
  });

  it("renders diagnostics only behind the server-provided capability", () => {
    expect(client).toContain("debugEnabled && clientDebugSnapshot");
    expect(panel).toContain("AI Import Debug Details");
    expect(panel).toContain("AI_CALENDAR_DEBUG_WARNING");
    expect(panel).toContain("Copy Debug Summary");
    expect(panel).toContain("Copy Current Blockers");
    expect(panel).toContain("Download Debug JSON");
    expect(panel).toContain("Client/server blocker mismatch");
    expect(client).toContain("Create Calendar is disabled because:");
    expect(client).toContain("debugEnabled && debugPresentationMismatch");
    expect(client).toContain(
      "Debug mismatch: visible blocker state differs from normalized blocker state."
    );
  });

  it("logs each requested safe pipeline and resolution event", () => {
    for (const event of [
      "review_issues_raw",
      "review_issues_normalized",
      "review_issues_deduplicated",
      "readiness_calculated",
      "create_calendar_disabled",
      "issue_resolution_started",
      "issue_resolution_finished",
      "issue_resolution_failed",
    ]) {
      expect(`${actions}\n${client}`).toContain(event);
    }
    expect(actions).not.toContain("sourceText");
    expect(actions).not.toContain("rawResponse");
    expect(actions).not.toContain("pdfBytes");
  });
});
