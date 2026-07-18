import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AI_CALENDAR_COUNT_REVIEW_REQUIRED_KEYS,
  AI_CALENDAR_REVIEW_REQUIRED_KEYS,
  callWithAiCalendarReviewAuditPreflight,
  serializeAiCalendarReviewAuditPayload,
  validateAiCalendarReviewAuditPayload,
  type AiCalendarReviewAuditPayload,
} from "./aiCalendarReviewAuditPayload";

const canonicalMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260717223000_create_ai_calendar_import_review_audit.sql"
  ),
  "utf8"
);

function completePayload() {
  return serializeAiCalendarReviewAuditPayload({
    analysisAttemptId: "5fcd6721-a0ca-40a9-bb9a-6c9148c6aead",
    analysisVersion: "calendar-v12",
    classificationDigest: "classification-digest",
    acknowledgedIssueCodes: ["instructional_day_count_mismatch"],
    finalInstructionalDayCount: 180,
    reviewNote: "private review note",
    countReview: {
      reasonCode: "instructional_day_count_mismatch",
      declaredInstructionalDayCount: 181,
      generatedInstructionalDayCount: 180,
      finalInstructionalDayCount: 180,
      acknowledged: true,
      status: "resolved",
      classifications: [
        { date: "2027-05-31", classification: "no_school", reviewed: true },
      ],
    },
  });
}

describe("AI calendar review audit payload", () => {
  it("serializes exactly the snake_case keys consumed by the canonical SQL", () => {
    const payload = completePayload();
    expect(Object.keys(payload.p_review)).toEqual([
      "analysis_attempt_id",
      "analysis_version",
      "classification_digest",
      "acknowledged_issue_codes",
      "final_approved_instructional_day_count",
      "review_note",
    ]);
    expect(Object.keys(payload.p_count_review || {})).toEqual([
      "reason_code",
      "declared_instructional_day_count",
      "generated_instructional_day_count",
      "final_approved_instructional_day_count",
      "acknowledged",
      "review_status",
      "classifications",
      "classification_digest",
    ]);
    expect(Object.keys(payload.p_review).some((key) => /[A-Z]/.test(key))).toBe(false);
    expect(
      Object.keys(payload.p_count_review || {}).some((key) => /[A-Z]/.test(key))
    ).toBe(false);
  });

  it("keeps required-key constants aligned with actual SQL validation", () => {
    expect(AI_CALENDAR_REVIEW_REQUIRED_KEYS).toEqual([
      "analysis_attempt_id",
      "analysis_version",
      "classification_digest",
      "acknowledged_issue_codes",
      "final_approved_instructional_day_count",
    ]);
    expect(AI_CALENDAR_COUNT_REVIEW_REQUIRED_KEYS).toEqual([
      "reason_code",
      "declared_instructional_day_count",
      "generated_instructional_day_count",
      "final_approved_instructional_day_count",
      "acknowledged",
      "review_status",
      "classifications",
      "classification_digest",
    ]);
    const reviewSqlAccess = {
      analysis_attempt_id: "p_review->>'analysis_attempt_id'",
      analysis_version: "p_review->>'analysis_version'",
      classification_digest: "p_review->>'classification_digest'",
      acknowledged_issue_codes: "p_review->'acknowledged_issue_codes'",
      final_approved_instructional_day_count:
        "p_review->>'final_approved_instructional_day_count'",
    } satisfies Record<(typeof AI_CALENDAR_REVIEW_REQUIRED_KEYS)[number], string>;
    const countReviewSqlAccess = {
      reason_code: "p_count_review->>'reason_code'",
      declared_instructional_day_count:
        "p_count_review->>'declared_instructional_day_count'",
      generated_instructional_day_count:
        "p_count_review->>'generated_instructional_day_count'",
      final_approved_instructional_day_count:
        "p_count_review->>'final_approved_instructional_day_count'",
      acknowledged: "p_count_review->>'acknowledged'",
      review_status: "p_count_review->>'review_status'",
      classifications: "p_count_review->'classifications'",
      classification_digest: "p_count_review->>'classification_digest'",
    } satisfies Record<
      (typeof AI_CALENDAR_COUNT_REVIEW_REQUIRED_KEYS)[number],
      string
    >;
    for (const access of Object.values(reviewSqlAccess)) {
      expect(canonicalMigration).toContain(access);
    }
    for (const access of Object.values(countReviewSqlAccess)) {
      expect(canonicalMigration).toContain(access);
    }
    expect(canonicalMigration).not.toContain("p_review->>'reviewed_at'");
    expect(canonicalMigration).not.toContain("p_count_review->>'reviewed_at'");
  });

  it("accepts an optional null review_note", () => {
    const payload = completePayload();
    payload.p_review.review_note = null;
    expect(validateAiCalendarReviewAuditPayload(payload)).toMatchObject({
      success: true,
      missingKeys: [],
    });
  });

  it("rejects missing analysis_version before the RPC is called", async () => {
    const payload = completePayload();
    payload.p_review.analysis_version = null;
    const rpc = vi.fn(async () => ({ data: { status: "success" }, error: null }));
    const logDiagnostics = vi.fn();
    const result = await callWithAiCalendarReviewAuditPreflight({
      payload,
      logDiagnostics,
      call: rpc,
    });
    expect(result).toEqual({
      success: false,
      reasonCode: "review_audit_payload_incomplete",
      missingKeys: ["p_review.analysis_version"],
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(logDiagnostics).toHaveBeenCalledOnce();
  });

  it("logs only safe structural diagnostics", () => {
    const payload = completePayload();
    const { diagnostics } = validateAiCalendarReviewAuditPayload(payload);
    expect(Object.keys(diagnostics)).toEqual([
      "reviewKeys",
      "countReviewKeys",
      "missingReviewKeys",
      "missingCountReviewKeys",
      "nullRequiredReviewKeys",
      "nullRequiredCountReviewKeys",
      "reviewValueTypes",
      "countReviewValueTypes",
      "analysisAttemptId",
      "analysisVersion",
    ]);
    expect(diagnostics.reviewValueTypes.review_note).toBe("string");
    expect(diagnostics.countReviewValueTypes.classifications).toBe("array");
    expect(JSON.stringify(diagnostics)).not.toContain("private review note");
    expect(JSON.stringify(diagnostics)).not.toContain("2027-05-31");
  });

  it("calls the RPC once when the complete payload passes preflight", async () => {
    const payload = completePayload();
    const rpcResult = { data: { status: "success" }, error: null };
    const rpc = vi.fn(async () => rpcResult);
    const result = await callWithAiCalendarReviewAuditPreflight({
      payload,
      logDiagnostics: vi.fn(),
      call: rpc,
    });
    expect(result).toEqual({ success: true, result: rpcResult });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("reports absent required keys using their RPC object path", () => {
    const payload = completePayload();
    const incompleteReview: Partial<AiCalendarReviewAuditPayload["p_review"]> = {
      ...payload.p_review,
    };
    delete incompleteReview.classification_digest;
    const result = validateAiCalendarReviewAuditPayload(
      {
        ...payload,
        p_review: incompleteReview,
      } as AiCalendarReviewAuditPayload
    );
    expect(result.diagnostics.missingReviewKeys).toEqual([
      "classification_digest",
    ]);
    expect(result.missingKeys).toContain("p_review.classification_digest");
  });
});
