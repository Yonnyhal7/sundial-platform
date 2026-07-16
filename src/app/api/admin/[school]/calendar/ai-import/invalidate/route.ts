import { NextResponse } from "next/server";
import {
  invalidateCalendarAnalysisCache,
} from "@/lib/calendarWizard/aiCalendarAnalysisCache.server";
import {
  logAiImportStatusDiagnostic,
  resolveAiImportStatusAccess,
} from "@/lib/calendarWizard/aiImportStatus.server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ school: string }>;
};

const allowedReasons = new Set([
  "user_requested_reanalysis",
  "user_rejected_result",
  "incorrect_schedule_assignments",
  "stale_result",
  "administrator_reset",
]);

export async function POST(request: Request, context: RouteContext) {
  const { school } = await context.params;
  const startedAt = Date.now();
  let body: { pdfHash?: unknown; reason?: unknown };

  try {
    body = (await request.json()) as { pdfHash?: unknown; reason?: unknown };
  } catch {
    return NextResponse.json(
      { status: "failed", reasonCode: "invalid_request" },
      { status: 400 }
    );
  }

  const reason =
    typeof body.reason === "string" && allowedReasons.has(body.reason)
      ? body.reason
      : "administrator_reset";
  const access = await resolveAiImportStatusAccess({
    school,
    pdfHash: typeof body.pdfHash === "string" ? body.pdfHash : null,
    startedAt: null,
  });

  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  await invalidateCalendarAnalysisCache(access.cacheKeys, reason);
  logAiImportStatusDiagnostic({
    event: "cache_invalidated",
    school,
    durationMs: Date.now() - startedAt,
    reasonCode: reason,
  });

  return NextResponse.json({ status: "ok" });
}
