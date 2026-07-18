import type {
  AiCalendarImportResult,
  AiImportDraftMetadata,
  AiImportWarningResolution,
} from "./aiImportTypes";
import type { ClassifiedCalendarWarning } from "./aiQuickSetupPersistence";
import type {
  CalendarGenerationWarning,
  GeneratedCalendarDay,
  RotationBehavior,
} from "./types";

export const AI_CALENDAR_DEBUG_WARNING = "Development diagnostics — remove before pilot";

export type AiCalendarDebugHistoryEntry = {
  stage: string;
  severity: string;
  status: string;
};

export type AiCalendarDebugIssue = {
  issueId: string;
  issueCode: string;
  severity: string;
  status: string;
  affectedDates: string[];
  displayMessage: string;
  sourceLabels: string[];
  currentClassification: string;
  proposedClassification: string;
  createdBy: string;
  sourceArray: string;
  persistedOrGenerated: string;
  analysisVersion?: string;
  analysisAttemptId?: string;
  cacheStrategy?: string;
  cacheState: "cache_hit" | "fresh_analysis" | "unknown";
  resolutionState: string;
  unresolvedBlocker: boolean;
  disablesCreateCalendar: boolean;
  blockingReason: string;
  canonicalIssueKey: string;
  relatedWarningCodes: string[];
  relatedScheduleIds: string[];
  previewAssignmentSource: string;
  rotationBehavior: RotationBehavior | "not_applicable";
  createdAtStage: string;
  lastModifiedAtStage: string;
  severityChangedAtStage?: string;
  statusChangedAtStage?: string;
  history: AiCalendarDebugHistoryEntry[];
};

export type AiCalendarDebugCounts = {
  rawWarningCount: number;
  normalizedIssueCount: number;
  deduplicatedIssueCount: number;
  unresolvedBlockingCount: number;
  needsReviewCount: number;
  automaticallyResolvedCount: number;
  informationalCount: number;
  acknowledgedCount: number;
};

export type AiCalendarDebugRestoreInfo = {
  restoredFromCache: boolean;
  restoredFromWizardDraft: boolean;
  cachedResultVersion?: string;
  draftVersion?: number;
  currentAnalysisAttemptId?: string;
  draftAnalysisAttemptId?: string;
  staleDraftDetected: boolean;
};

export type AiCalendarDebugSnapshot = {
  generatedAt: string;
  scope: { schoolSlug: string; routeRequestId: string };
  analysisVersion?: string;
  analysisAttemptId?: string;
  counts: AiCalendarDebugCounts;
  blockerIds: string[];
  issues: AiCalendarDebugIssue[];
  restore: AiCalendarDebugRestoreInfo;
};

export type AiCalendarDebugResolutionEvent = {
  event:
    | "issue_resolution_started"
    | "issue_resolution_finished"
    | "issue_resolution_failed";
  routeRequestId: string;
  issueId: string;
  affectedDates: string[];
  previousSeverity: string;
  previousStatus: string;
  nextSeverity?: string;
  nextStatus?: string;
  draftSaveResult?: string;
  remainingBlockerIds?: string[];
  occurredAt: string;
};

type ReviewClassification = {
  issues: ClassifiedCalendarWarning[];
  blockingWarnings: ClassifiedCalendarWarning[];
  needsReviewWarnings: ClassifiedCalendarWarning[];
  automaticallyResolvedWarnings: ClassifiedCalendarWarning[];
  informationalWarnings: ClassifiedCalendarWarning[];
  acknowledgedReviewWarnings: ClassifiedCalendarWarning[];
  diagnosticCounts: {
    rawWarningCount: number;
    normalizedIssueCount: number;
    deduplicatedIssueCount: number;
  };
};

function issueStage(issue: ClassifiedCalendarWarning) {
  if (issue.createdBy === "calendar_generator") return "calendar generation";
  if (issue.createdBy === "review_issue_normalizer") return "overlap normalization";
  if (issue.createdBy === "ai_response") return "AI response";
  return issue.persistedOrGenerated === "persisted"
    ? "text normalization"
    : "review presentation";
}

function issueDatesOverlap(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return false;
  const dates = new Set(left);
  return right.some((date) => dates.has(date));
}

function warningDates(warning: CalendarGenerationWarning) {
  return warning.dates || [];
}

function currentClassification(day: GeneratedCalendarDay | undefined) {
  if (!day) return "No preview day found";
  if (!day.isSchoolDay) return "No school; no schedule assigned; rotation paused";
  return `Instructional; schedule ${day.scheduleId || "unassigned"}`;
}

function safeDisplayMessage(issue: ClassifiedCalendarWarning) {
  if (issue.persistedOrGenerated === "persisted") {
    return `Persisted calendar warning ${issue.issueCode}. Review the normalized dates, labels, severity, and status below.`;
  }
  return issue.message;
}

function rotationBehavior(
  importResult: AiCalendarImportResult,
  date: string | undefined,
  day: GeneratedCalendarDay | undefined
): RotationBehavior | "not_applicable" {
  if (!date || !day) return "not_applicable";
  const classification = importResult.dateClassifications?.find((item) => item.date === date);
  if (classification?.rotationBehavior) return classification.rotationBehavior;
  const special = importResult.specialDays.find(
    (item) => date >= item.startDate && date <= item.endDate
  );
  if (special?.rotationBehavior) return special.rotationBehavior;
  const assignment = importResult.datedScheduleAssignments?.find((item) => item.date === date);
  if (assignment?.rotationBehavior) return assignment.rotationBehavior;
  return day.isSchoolDay ? "advance" : "pause";
}

function relatedScheduleIds(importResult: AiCalendarImportResult, dates: string[]) {
  const ids = new Set<string>();
  for (const date of dates) {
    for (const special of importResult.specialDays) {
      if (date >= special.startDate && date <= special.endDate && special.scheduleTempId) {
        ids.add(special.scheduleTempId);
      }
    }
    const assignment = importResult.datedScheduleAssignments?.find((item) => item.date === date);
    if (assignment?.scheduleTempId) ids.add(assignment.scheduleTempId);
  }
  return [...ids].sort();
}

function sourceLabels(importResult: AiCalendarImportResult, dates: string[]) {
  const labels = new Set<string>();
  for (const date of dates) {
    for (const range of importResult.noSchoolRanges) {
      if (date >= range.startDate && date <= range.endDate) labels.add(range.label);
    }
    for (const special of importResult.specialDays) {
      if (date >= special.startDate && date <= special.endDate) labels.add(special.label);
    }
    for (const item of importResult.informationalDates) {
      if (item.date === date) labels.add(item.label);
    }
  }
  return [...labels].sort();
}

export function getAiCalendarCanonicalIssueKey(issue: ClassifiedCalendarWarning) {
  return [
    issue.issueCode,
    [...issue.affectedDates].sort().join(",") || "none",
    [...issue.relevantLabelIdentities].sort().join(",") || "none",
  ].join("::");
}

export function buildAiCalendarDebugSnapshot({
  schoolSlug,
  routeRequestId,
  importResult,
  generationWarnings,
  previewDays,
  classification,
  metadata,
  warningResolutions,
  restore,
}: {
  schoolSlug: string;
  routeRequestId: string;
  importResult: AiCalendarImportResult;
  generationWarnings: CalendarGenerationWarning[];
  previewDays: GeneratedCalendarDay[];
  classification: ReviewClassification;
  metadata?: AiImportDraftMetadata | null;
  warningResolutions?: AiImportWarningResolution[];
  restore: AiCalendarDebugRestoreInfo;
}): AiCalendarDebugSnapshot {
  const resolutionById = new Map(
    (warningResolutions || []).map((resolution) => [
      resolution.issueId || resolution.code,
      resolution,
    ])
  );
  const issues = classification.issues.map((issue): AiCalendarDebugIssue => {
    const date = issue.affectedDates[0];
    const day = date ? previewDays.find((candidate) => candidate.date === date) : undefined;
    const issueSourceLabels = sourceLabels(importResult, issue.affectedDates);
    const createdAtStage = issueStage(issue);
    const originalSeverity = issue.originalSeverity;
    const originalStatus = originalSeverity === "blocking" ? "unresolved" : "unclassified";
    const unresolvedBlocker = issue.severity === "blocking" && issue.status === "unresolved";
    const relatedCodes = new Set<string>([String(issue.code), issue.issueCode]);
    for (const warning of generationWarnings) {
      if (issueDatesOverlap(issue.affectedDates, warningDates(warning))) {
        relatedCodes.add(warning.code);
      }
    }
    const resolution = resolutionById.get(issue.issueId) || resolutionById.get(issue.issueCode);
    const severityChanged = originalSeverity !== "unspecified" && originalSeverity !== issue.severity;
    const statusChanged = originalStatus !== issue.status;
    const history: AiCalendarDebugHistoryEntry[] = [
      { stage: createdAtStage, severity: originalSeverity, status: originalStatus },
    ];
    if (restore.restoredFromCache) {
      history.push({
        stage: "cache restoration",
        severity: originalSeverity,
        status: originalStatus,
      });
    }
    if (restore.restoredFromWizardDraft) {
      history.push({
        stage: "draft restoration",
        severity: originalSeverity,
        status: originalStatus,
      });
    }
    if (day?.assignmentSource === "pdf_vector_fill") {
      history.push({
        stage: "vector merge",
        severity: originalSeverity,
        status: originalStatus,
      });
    }
    history.push({
      stage: "normalizeReviewIssues",
      severity: issue.severity,
      status: issue.status,
    });

    return {
      issueId: issue.issueId,
      issueCode: issue.issueCode,
      severity: issue.severity,
      status: issue.status,
      affectedDates: issue.affectedDates,
      displayMessage: safeDisplayMessage(issue),
      sourceLabels: issueSourceLabels,
      currentClassification: currentClassification(day),
      proposedClassification: issue.suggestedCorrection || currentClassification(day),
      createdBy: issue.createdBy,
      sourceArray: issue.sourceArray,
      persistedOrGenerated: issue.persistedOrGenerated,
      analysisVersion: issue.analysisVersion || metadata?.analysisVersion,
      analysisAttemptId: metadata?.analysisAttemptId,
      cacheStrategy: metadata?.cacheStrategy,
      cacheState: metadata?.cacheHit === true
        ? "cache_hit"
        : metadata?.cacheHit === false
          ? "fresh_analysis"
          : "unknown",
      resolutionState: resolution?.status || issue.status,
      unresolvedBlocker,
      disablesCreateCalendar: unresolvedBlocker,
      blockingReason: unresolvedBlocker
        ? `${issue.issueCode} retained unresolved blocking state after final normalization.`
        : "This issue does not disable Create Calendar.",
      canonicalIssueKey: getAiCalendarCanonicalIssueKey(issue),
      relatedWarningCodes: [...relatedCodes].filter(Boolean).sort(),
      relatedScheduleIds: relatedScheduleIds(importResult, issue.affectedDates),
      previewAssignmentSource: day?.assignmentSource || "none",
      rotationBehavior: rotationBehavior(importResult, date, day),
      createdAtStage,
      lastModifiedAtStage: "review presentation",
      severityChangedAtStage: severityChanged ? "normalizeReviewIssues" : undefined,
      statusChangedAtStage: statusChanged ? "normalizeReviewIssues" : undefined,
      history,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    scope: { schoolSlug, routeRequestId },
    analysisVersion: metadata?.analysisVersion,
    analysisAttemptId: metadata?.analysisAttemptId,
    counts: {
      ...classification.diagnosticCounts,
      unresolvedBlockingCount: classification.blockingWarnings.length,
      needsReviewCount: classification.needsReviewWarnings.length,
      automaticallyResolvedCount: classification.automaticallyResolvedWarnings.length,
      informationalCount: classification.informationalWarnings.length,
      acknowledgedCount: classification.acknowledgedReviewWarnings.length,
    },
    blockerIds: classification.blockingWarnings.map((issue) => issue.issueId),
    issues,
    restore,
  };
}
