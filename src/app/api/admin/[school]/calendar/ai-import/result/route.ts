import { NextResponse } from "next/server";
import {
  AI_CALENDAR_PDF_STRATEGY,
  AI_CALENDAR_TEXT_STRATEGY,
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

  const access = await resolveAiImportStatusAccess({
    school,
    pdfHash: url.searchParams.get("pdfHash"),
    startedAt: url.searchParams.get("startedAt"),
    analysisAttemptId: url.searchParams.get("attemptId"),
  });

  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  let result = null;
  for (const cacheKey of access.cacheKeys) {
    result = await readCalendarAnalysisCacheEntry(cacheKey, {
      minCreatedAt: access.startedAt || undefined,
      analysisAttemptId: access.analysisAttemptId,
    });
    if (result) break;
  }

  if (!result) {
    logAiImportStatusDiagnostic({
      event: "analysis_still_pending",
      school,
      durationMs: Date.now() - startedAt,
      reasonCode: "result_not_ready",
    });
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  logAiImportStatusDiagnostic({
    event: "cached_result_found",
    school,
    durationMs: Date.now() - startedAt,
  });
  return NextResponse.json({
    status: "success",
    analysisAttemptId: access.analysisAttemptId,
    importResult: result.result,
    outcome: "successful",
    analysisStrategy:
      result.strategy === AI_CALENDAR_TEXT_STRATEGY
        ? AI_CALENDAR_TEXT_STRATEGY
        : AI_CALENDAR_PDF_STRATEGY,
    cache: {
      hit: true,
      analyzedAt: result.createdAt,
      strategy:
        result.strategy === AI_CALENDAR_TEXT_STRATEGY
          ? AI_CALENDAR_TEXT_STRATEGY
          : AI_CALENDAR_PDF_STRATEGY,
      version: result.analyzerVersion,
    },
  });
}
