import { NextResponse } from "next/server";
import {
  getCalendarAnalysisFailure,
  getCalendarAnalysisStage,
  hasPendingCalendarAnalysis,
  readCalendarAnalysisStage,
  readCalendarAnalysisCacheEntry,
} from "@/lib/calendarWizard/aiCalendarAnalysisCache.server";
import {
  logAiImportStatusDiagnostic,
  resolveAiImportStatusAccess,
} from "@/lib/calendarWizard/aiImportStatus.server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ school: string }>;
};

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
    });
    if (cached) {
      readyKey = cacheKey;
      break;
    }
  }

  if (readyKey) {
    logAiImportStatusDiagnostic({
      event: "cached_result_found",
      school,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      status: "ready",
      resultId: readyKey.pdfHash,
      stage: "ready",
    });
  }

  const failure = access.cacheKeys
    .map((cacheKey) => getCalendarAnalysisFailure(cacheKey))
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

  const memoryStages = access.cacheKeys.flatMap((cacheKey) => {
    const stage = getCalendarAnalysisStage(cacheKey);
    return stage ? [stage] : [];
  });
  const persistedStages = (
    await Promise.all(
      access.cacheKeys.map((cacheKey) =>
        readCalendarAnalysisStage(cacheKey, {
          minUpdatedAt: access.startedAt || undefined,
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
    });
  }

  if (access.startedAt && Date.now() - access.startedAt > 15 * 60 * 1000) {
    logAiImportStatusDiagnostic({
      event: "polling_expired",
      school,
      durationMs: Date.now() - startedAt,
      reasonCode: "expired",
    });
    return NextResponse.json({
      status: "expired",
      reasonCode: "expired",
      stage: "confirmed_failed",
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
