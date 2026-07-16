import { NextResponse } from "next/server";
import {
  AI_CALENDAR_STALE_DEADLINE_GRACE_MS,
  getCalendarAnalysisFailure,
  getCalendarAnalysisStage,
  hasPendingCalendarAnalysis,
  markStaleCalendarAnalysisIfNeeded,
  readCalendarAnalysisStage,
  readCalendarAnalysisCacheEntry,
} from "@/lib/calendarWizard/aiCalendarAnalysisCache.server";
import {
  logAiImportStatusDiagnostic,
  resolveAiImportStatusAccess,
} from "@/lib/calendarWizard/aiImportStatus.server";
import { getOpenAiCalendarTimeoutMs } from "@/lib/calendarWizard/openAiCalendarAnalyzerUtils";
import type { CalendarAnalysisStageSnapshot } from "@/lib/calendarWizard/aiCalendarAnalysisCache.server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ school: string }>;
};

function statusMetadata(stage: CalendarAnalysisStageSnapshot | null | undefined) {
  if (!stage) return {};
  return {
    stage: stage.stage,
    strategy: stage.strategy,
    analysisAttemptId: stage.analysisAttemptId,
    attemptId: stage.analysisAttemptId,
    routeRequestId: stage.requestId,
    stageStartedAt: stage.updatedAt,
    jobStartedAt: stage.createdAt,
    updatedAt: stage.updatedAt,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { school } = await context.params;
  const startedAt = Date.now();
  const url = new URL(request.url);

  logAiImportStatusDiagnostic({
    event: "status_poll_started",
    school,
    durationMs: 0,
  });

  const access = await resolveAiImportStatusAccess({
    school,
    pdfHash: url.searchParams.get("pdfHash"),
    startedAt: url.searchParams.get("startedAt"),
    analysisAttemptId: url.searchParams.get("attemptId"),
  });

  if (!access.ok) {
    logAiImportStatusDiagnostic({
      event: "confirmed_analysis_failed",
      school,
      durationMs: Date.now() - startedAt,
      reasonCode: access.body.reasonCode,
    });
    return NextResponse.json(access.body, { status: access.status });
  }

  let readyKey = null;
  for (const cacheKey of access.cacheKeys) {
    const cached = await readCalendarAnalysisCacheEntry(cacheKey, {
      minCreatedAt: access.startedAt || undefined,
      analysisAttemptId: access.analysisAttemptId,
    });
    if (cached) {
      readyKey = cacheKey;
      break;
    }
  }

  if (readyKey) {
    const readyStage =
      getCalendarAnalysisStage(readyKey, access.analysisAttemptId) ||
      (await readCalendarAnalysisStage(readyKey, {
        minUpdatedAt: access.startedAt || undefined,
        analysisAttemptId: access.analysisAttemptId,
      }));
    logAiImportStatusDiagnostic({
      event: "cached_result_found",
      school,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      status: "ready",
      resultId: readyKey.pdfHash,
      ...statusMetadata(readyStage),
      stage: "ready",
      cacheHit: true,
    });
  }

  const failure = access.cacheKeys
    .map((cacheKey) => getCalendarAnalysisFailure(cacheKey, access.analysisAttemptId))
    .find(Boolean);

  if (failure) {
    logAiImportStatusDiagnostic({
      event: "confirmed_analysis_failed",
      school,
      durationMs: Date.now() - startedAt,
      reasonCode: failure.reasonCode,
    });
    return NextResponse.json({
      status: "failed",
      reasonCode: failure.reasonCode,
      stage: "confirmed_failed",
    });
  }

  const staleStage = (
    await Promise.all(
      access.cacheKeys.map((cacheKey) => markStaleCalendarAnalysisIfNeeded(cacheKey, { analysisAttemptId: access.analysisAttemptId }))
    )
  ).find(Boolean);

  if (staleStage) {
    logAiImportStatusDiagnostic({
      event: "confirmed_analysis_failed",
      school,
      durationMs: Date.now() - startedAt,
      reasonCode: staleStage.reasonCode,
    });
    return NextResponse.json({
      status: "failed",
      reasonCode: staleStage.reasonCode,
      stage: "confirmed_failed",
      strategy: staleStage.strategy,
      ...statusMetadata(staleStage),
    });
  }

  const memoryStages = access.cacheKeys.flatMap((cacheKey) => {
    const stage = getCalendarAnalysisStage(cacheKey, access.analysisAttemptId);
    return stage ? [stage] : [];
  });
  const persistedStages = (
    await Promise.all(
      access.cacheKeys.map((cacheKey) =>
        readCalendarAnalysisStage(cacheKey, {
          minUpdatedAt: access.startedAt || undefined,
          analysisAttemptId: access.analysisAttemptId,
        })
      )
    )
  ).filter((stage): stage is NonNullable<typeof stage> => Boolean(stage));
  const activeStages = [...memoryStages, ...persistedStages];
  const activeStage = activeStages.sort((a, b) => b.updatedAt - a.updatedAt)[0];

  if (activeStage?.status === "failed") {
    logAiImportStatusDiagnostic({
      event: "confirmed_analysis_failed",
      school,
      durationMs: Date.now() - startedAt,
      reasonCode: activeStage.reasonCode,
    });
    return NextResponse.json({
      status: "failed",
      reasonCode: activeStage.reasonCode,
      stage: activeStage.stage,
      strategy: activeStage.strategy,
      ...statusMetadata(activeStage),
    });
  }

  if (
    access.cacheKeys.some((cacheKey) => hasPendingCalendarAnalysis(cacheKey)) ||
    activeStage?.status === "pending"
  ) {
    logAiImportStatusDiagnostic({
      event: "analysis_still_pending",
      school,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      status: "pending",
      stage: activeStage?.stage || "checking_cache",
      strategy: activeStage?.strategy,
      ...statusMetadata(activeStage),
    });
  }

  if (
    access.startedAt &&
    Date.now() - access.startedAt >
      getOpenAiCalendarTimeoutMs() + AI_CALENDAR_STALE_DEADLINE_GRACE_MS
  ) {
    logAiImportStatusDiagnostic({
      event: "stale_job_detected",
      school,
      durationMs: Date.now() - startedAt,
      reasonCode: "analysis_job_stale",
    });
    return NextResponse.json({
      status: "failed",
      reasonCode: "analysis_job_stale",
      stage: "confirmed_failed",
    });
  }

  // A freshly submitted POST may still be hashing before its claimed row is visible. After a
  // short grace period, absence of this exact owner means the recovery token was superseded;
  // it must not attach to whichever newer attempt currently owns the PDF row.
  if (access.startedAt && Date.now() - access.startedAt > 10_000) {
    logAiImportStatusDiagnostic({
      event: "stale_status_update_rejected",
      school,
      durationMs: Date.now() - startedAt,
      reasonCode: "analysis_attempt_superseded",
    });
    return NextResponse.json({
      status: "expired",
      reasonCode: "analysis_attempt_superseded",
      analysisAttemptId: access.analysisAttemptId,
    });
  }

  logAiImportStatusDiagnostic({
    event: "analysis_still_pending",
    school,
    durationMs: Date.now() - startedAt,
    reasonCode: "cache_not_ready",
  });
  return NextResponse.json({ status: "pending", stage: "checking_cache" });
}
