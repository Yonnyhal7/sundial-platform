import { NextResponse } from "next/server";
import { readCalendarAnalysisCache } from "@/lib/calendarWizard/aiCalendarAnalysisCache.server";
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
  });

  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  let result = null;
  for (const cacheKey of access.cacheKeys) {
    result = await readCalendarAnalysisCache(cacheKey, {
      minCreatedAt: access.startedAt || undefined,
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
    importResult: result,
    outcome: "successful",
  });
}
