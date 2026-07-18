export const AI_CALENDAR_REVIEW_REQUIRED_KEYS = [
  "analysis_attempt_id",
  "analysis_version",
  "classification_digest",
  "acknowledged_issue_codes",
  "final_approved_instructional_day_count",
] as const;

export const AI_CALENDAR_COUNT_REVIEW_REQUIRED_KEYS = [
  "reason_code",
  "declared_instructional_day_count",
  "generated_instructional_day_count",
  "final_approved_instructional_day_count",
  "acknowledged",
  "review_status",
  "classifications",
  "classification_digest",
] as const;

export type AiCalendarReviewAuditPayload = {
  p_review: {
    analysis_attempt_id: string | null;
    analysis_version: string | null;
    classification_digest: string | null;
    acknowledged_issue_codes: string[];
    final_approved_instructional_day_count: number;
    review_note: string | null;
  };
  p_count_review: {
    reason_code: "instructional_day_count_mismatch";
    declared_instructional_day_count: number;
    generated_instructional_day_count: number;
    final_approved_instructional_day_count: number;
    acknowledged: boolean;
    review_status: "acknowledged" | "resolved";
    classifications: unknown[];
    classification_digest: string | null;
  } | null;
};

type SerializeAiCalendarReviewAuditInput = {
  analysisAttemptId?: string | null;
  analysisVersion?: string | null;
  classificationDigest?: string | null;
  acknowledgedIssueCodes: Iterable<string>;
  finalInstructionalDayCount: number;
  reviewNote?: string | null;
  countReview?: {
    reasonCode: "instructional_day_count_mismatch";
    declaredInstructionalDayCount: number;
    generatedInstructionalDayCount: number;
    finalInstructionalDayCount: number;
    acknowledged: boolean;
    status: "acknowledged" | "resolved";
    classifications: readonly unknown[];
  } | null;
};

export type AiCalendarReviewAuditPreflightDiagnostics = {
  reviewKeys: string[];
  countReviewKeys: string[];
  missingReviewKeys: string[];
  missingCountReviewKeys: string[];
  nullRequiredReviewKeys: string[];
  nullRequiredCountReviewKeys: string[];
  reviewValueTypes: Record<string, string>;
  countReviewValueTypes: Record<string, string>;
  analysisAttemptId: string | null;
  analysisVersion: string | null;
};

type ReviewRecord = Record<string, unknown>;

function valueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function valueTypes(record: ReviewRecord | null) {
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, valueType(value)])
  );
}

function missingKeys(record: ReviewRecord | null, requiredKeys: readonly string[]) {
  if (!record) return [...requiredKeys];
  return requiredKeys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(record, key)
  );
}

function nullRequiredKeys(record: ReviewRecord | null, requiredKeys: readonly string[]) {
  if (!record) return [];
  return requiredKeys.filter((key) => {
    const value = record[key];
    return (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim().length === 0)
    );
  });
}

function invalidReviewKeys(review: ReviewRecord) {
  const invalid: string[] = [];
  if (typeof review.analysis_attempt_id !== "string" || !review.analysis_attempt_id.trim()) {
    invalid.push("analysis_attempt_id");
  }
  if (typeof review.analysis_version !== "string" || !review.analysis_version.trim()) {
    invalid.push("analysis_version");
  }
  if (typeof review.classification_digest !== "string" || !review.classification_digest.trim()) {
    invalid.push("classification_digest");
  }
  if (!Array.isArray(review.acknowledged_issue_codes)) {
    invalid.push("acknowledged_issue_codes");
  }
  if (
    typeof review.final_approved_instructional_day_count !== "number" ||
    !Number.isInteger(review.final_approved_instructional_day_count) ||
    review.final_approved_instructional_day_count < 0
  ) {
    invalid.push("final_approved_instructional_day_count");
  }
  return invalid;
}

function invalidCountReviewKeys(countReview: ReviewRecord) {
  const invalid: string[] = [];
  if (countReview.reason_code !== "instructional_day_count_mismatch") {
    invalid.push("reason_code");
  }
  for (const key of [
    "declared_instructional_day_count",
    "generated_instructional_day_count",
    "final_approved_instructional_day_count",
  ] as const) {
    const value = countReview[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      invalid.push(key);
    }
  }
  if (countReview.acknowledged !== true) invalid.push("acknowledged");
  if (!["acknowledged", "resolved"].includes(String(countReview.review_status))) {
    invalid.push("review_status");
  }
  if (!Array.isArray(countReview.classifications)) invalid.push("classifications");
  if (
    typeof countReview.classification_digest !== "string" ||
    !countReview.classification_digest.trim()
  ) {
    invalid.push("classification_digest");
  }
  return invalid;
}

export function serializeAiCalendarReviewAuditPayload({
  analysisAttemptId,
  analysisVersion,
  classificationDigest,
  acknowledgedIssueCodes,
  finalInstructionalDayCount,
  reviewNote,
  countReview,
}: SerializeAiCalendarReviewAuditInput): AiCalendarReviewAuditPayload {
  return {
    p_review: {
      analysis_attempt_id: analysisAttemptId || null,
      analysis_version: analysisVersion || null,
      classification_digest: classificationDigest || null,
      acknowledged_issue_codes: [...acknowledgedIssueCodes],
      final_approved_instructional_day_count: finalInstructionalDayCount,
      review_note: reviewNote || null,
    },
    p_count_review: countReview
      ? {
          reason_code: countReview.reasonCode,
          declared_instructional_day_count:
            countReview.declaredInstructionalDayCount,
          generated_instructional_day_count:
            countReview.generatedInstructionalDayCount,
          final_approved_instructional_day_count:
            countReview.finalInstructionalDayCount,
          acknowledged: countReview.acknowledged,
          review_status: countReview.status,
          classifications: [...countReview.classifications],
          classification_digest: classificationDigest || null,
        }
      : null,
  };
}

export function validateAiCalendarReviewAuditPayload(
  payload: AiCalendarReviewAuditPayload
) {
  const review = payload.p_review as ReviewRecord;
  const countReview = payload.p_count_review as ReviewRecord | null;
  const missingReviewKeys = missingKeys(review, AI_CALENDAR_REVIEW_REQUIRED_KEYS);
  const missingCountReviewKeys = countReview
    ? missingKeys(countReview, AI_CALENDAR_COUNT_REVIEW_REQUIRED_KEYS)
    : [];
  const nullRequiredReviewKeys = nullRequiredKeys(
    review,
    AI_CALENDAR_REVIEW_REQUIRED_KEYS
  );
  const nullRequiredCountReviewKeys = countReview
    ? nullRequiredKeys(countReview, AI_CALENDAR_COUNT_REVIEW_REQUIRED_KEYS)
    : [];
  const invalidKeys = [
    ...invalidReviewKeys(review).map((key) => `p_review.${key}`),
    ...(countReview
      ? invalidCountReviewKeys(countReview).map((key) => `p_count_review.${key}`)
      : []),
  ];
  const incompleteKeys = [
    ...missingReviewKeys.map((key) => `p_review.${key}`),
    ...missingCountReviewKeys.map((key) => `p_count_review.${key}`),
    ...nullRequiredReviewKeys.map((key) => `p_review.${key}`),
    ...nullRequiredCountReviewKeys.map((key) => `p_count_review.${key}`),
    ...invalidKeys,
  ];
  const diagnostics: AiCalendarReviewAuditPreflightDiagnostics = {
    reviewKeys: Object.keys(review),
    countReviewKeys: Object.keys(countReview || {}),
    missingReviewKeys,
    missingCountReviewKeys,
    nullRequiredReviewKeys,
    nullRequiredCountReviewKeys,
    reviewValueTypes: valueTypes(review),
    countReviewValueTypes: valueTypes(countReview),
    analysisAttemptId:
      typeof review.analysis_attempt_id === "string"
        ? review.analysis_attempt_id
        : null,
    analysisVersion:
      typeof review.analysis_version === "string" ? review.analysis_version : null,
  };

  return {
    success: incompleteKeys.length === 0,
    missingKeys: [...new Set(incompleteKeys)],
    diagnostics,
  };
}

export async function callWithAiCalendarReviewAuditPreflight<TResult>({
  payload,
  logDiagnostics,
  call,
}: {
  payload: AiCalendarReviewAuditPayload;
  logDiagnostics: (diagnostics: AiCalendarReviewAuditPreflightDiagnostics) => void;
  call: () => PromiseLike<TResult>;
}) {
  const preflight = validateAiCalendarReviewAuditPayload(payload);
  logDiagnostics(preflight.diagnostics);
  if (!preflight.success) {
    return {
      success: false as const,
      reasonCode: "review_audit_payload_incomplete" as const,
      missingKeys: preflight.missingKeys,
    };
  }
  return { success: true as const, result: await call() };
}
