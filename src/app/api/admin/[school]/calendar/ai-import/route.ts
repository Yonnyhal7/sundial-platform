import { NextResponse } from "next/server";
import { canAccessAdminSection } from "@/lib/auth/adminPermissions";
import type { AnalyzeCalendarPdfResult } from "@/lib/calendarWizard/aiImportTypes";
import { validateCalendarPdfFile } from "@/lib/calendarWizard/aiPdfValidation";
import { analyzeCalendarPdf } from "@/lib/calendarWizard/openAiCalendarAnalyzer.server";
import { getOpenAiCalendarPdfModel, getOpenAiCalendarTextModel, logOpenAiCalendarEnvironmentDiagnostic } from "@/lib/calendarWizard/openAiCalendarAnalyzerUtils";
import { AI_CALENDAR_PDF_STRATEGY, AI_CALENDAR_PROMPT_SCHEMA_VERSION, AI_CALENDAR_TEXT_STRATEGY, dedupeCalendarAnalysis, readCalendarAnalysisCache, recordCalendarAnalysisFailure, writeCalendarAnalysisCache, type CalendarAnalysisCacheKey } from "@/lib/calendarWizard/aiCalendarAnalysisCache.server";
import { getSchoolForSetup } from "@/lib/schools";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ school: string }>;
};

function json(result: AnalyzeCalendarPdfResult, init?: ResponseInit) {
  return NextResponse.json(result, init);
}

function logAiImportRouteDiagnostic({
  level = "info",
  event,
  requestId,
  school,
  durationMs,
  status,
  reasonCode,
  fileSize,
  fileType,
}: {
  level?: "info" | "warn";
  event: string;
  requestId: string;
  school: string;
  durationMs: number;
  status?: string;
  reasonCode?: string;
  fileSize?: number;
  fileType?: string;
}) {
  const payload = {
    event,
    requestId,
    school,
    durationMs,
    status,
    reasonCode,
    fileSize,
    fileType,
  };

  if (level === "warn") {
    console.warn("AI calendar import route diagnostic", payload);
    return;
  }

  console.info("AI calendar import route diagnostic", payload);
}

function getCacheKeys({
  schoolId,
  pdfHash,
}: {
  schoolId: string;
  pdfHash: string;
}) {
  const pdfKey: CalendarAnalysisCacheKey = {
    schoolId,
    pdfHash,
    strategy: AI_CALENDAR_PDF_STRATEGY,
    model: getOpenAiCalendarPdfModel(),
    version: AI_CALENDAR_PROMPT_SCHEMA_VERSION,
  };
  const textKey: CalendarAnalysisCacheKey = {
    schoolId,
    pdfHash,
    strategy: AI_CALENDAR_TEXT_STRATEGY,
    model: getOpenAiCalendarTextModel(),
    version: AI_CALENDAR_PROMPT_SCHEMA_VERSION,
  };

  return { preferred: [pdfKey, textKey], byStrategy: { [AI_CALENDAR_PDF_STRATEGY]: pdfKey, [AI_CALENDAR_TEXT_STRATEGY]: textKey } };
}

export async function POST(request: Request, context: RouteContext) {
  const { school } = await context.params;
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const respond = (result: AnalyzeCalendarPdfResult, init?: ResponseInit) =>
    json(result, {
      ...init,
      headers: {
        ...(init?.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : init?.headers),
        "x-sundial-ai-import-request-id": requestId,
      },
    });

  try {
    logOpenAiCalendarEnvironmentDiagnostic("api_route_start");
    logAiImportRouteDiagnostic({
      event: "request_received",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
    });

    const schoolData = await getSchoolForSetup(school);

    if (!schoolData) {
      return respond(
        {
          status: "validation_error",
          message: "School not found.",
        },
        { status: 404 }
      );
    }
    logAiImportRouteDiagnostic({
      event: "school_resolved",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
    });

    const canImport = await canAccessAdminSection(schoolData.id, "calendar");
    if (!canImport) {
      return respond(
        {
          status: "permission_error",
          message: "You do not have permission to import this calendar.",
        },
        { status: 403 }
      );
    }
    logAiImportRouteDiagnostic({
      event: "permission_checked",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
    });

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      logAiImportRouteDiagnostic({
        level: "warn",
        event: "formdata_parse_failed",
        requestId,
        school,
        durationMs: Date.now() - startedAt,
      });
      return respond(
        {
          status: "validation_error",
          message: "Sundial could not read the uploaded PDF. Please choose the file again and retry.",
        },
        { status: 400 }
      );
    }
    const upload = formData.get("calendarPdf");

    if (!(upload instanceof File)) {
      return respond(
        {
          status: "validation_error",
          message: "Please upload a PDF calendar smaller than 20 MB.",
        },
        { status: 400 }
      );
    }
    logAiImportRouteDiagnostic({
      event: "upload_received",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
      fileSize: upload.size,
      fileType: upload.type || "unknown",
    });

    let validation;
    try {
      validation = await validateCalendarPdfFile(upload);
    } catch {
      logAiImportRouteDiagnostic({
        level: "warn",
        event: "pdf_validation_failed",
        requestId,
        school,
        durationMs: Date.now() - startedAt,
        fileSize: upload.size,
        fileType: upload.type || "unknown",
      });
      return respond(
        {
          status: "validation_error",
          message: "Sundial could not read the uploaded PDF. Please choose the file again and retry.",
        },
        { status: 400 }
      );
    }

    if (!validation.valid) {
      logAiImportRouteDiagnostic({
        level: "warn",
        event: "upload_rejected",
        requestId,
        school,
        durationMs: Date.now() - startedAt,
        status: "validation_error",
        fileSize: upload.size,
        fileType: upload.type || "unknown",
      });
      return respond(
        {
          status: "validation_error",
          message: validation.message,
        },
        { status: 400 }
      );
    }

    const pdfHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await upload.arrayBuffer())))
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const cacheKeys = getCacheKeys({ schoolId: schoolData.id, pdfHash });
    const analyzeAgain = formData.get("analyzeAgain") === "true";
    if (!analyzeAgain) {
      for (const cacheKey of cacheKeys.preferred) {
        const cached = await readCalendarAnalysisCache(cacheKey);
        if (cached) {
          logAiImportRouteDiagnostic({
            event: "cache_hit",
            requestId,
            school,
            durationMs: Date.now() - startedAt,
            status: "success",
          });
          return respond({ status: "success", importResult: cached, outcome: "successful" });
        }
      }
    }

    logAiImportRouteDiagnostic({
      event: "analysis_started",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
      fileSize: upload.size,
      fileType: upload.type || "unknown",
    });
    const pipelineKey = cacheKeys.byStrategy[AI_CALENDAR_PDF_STRATEGY];
    const result = await dedupeCalendarAnalysis(pipelineKey, () => analyzeCalendarPdf(upload));
    const resultCacheKey =
      result.status === "success" && result.analysisStrategy === AI_CALENDAR_TEXT_STRATEGY
        ? cacheKeys.byStrategy[AI_CALENDAR_TEXT_STRATEGY]
        : cacheKeys.byStrategy[AI_CALENDAR_PDF_STRATEGY];
    if (result.status === "success") await writeCalendarAnalysisCache(resultCacheKey, result.importResult);
    if (result.status !== "success") {
      for (const cacheKey of cacheKeys.preferred) {
        recordCalendarAnalysisFailure(cacheKey, result.reasonCode || result.status);
      }
    }
    logAiImportRouteDiagnostic({
      level: result.status === "success" ? "info" : "warn",
      event: "analysis_finished",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
      status: result.status,
      reasonCode: result.status === "success" ? undefined : result.reasonCode,
      fileSize: upload.size,
      fileType: upload.type || "unknown",
    });

    if (result.status === "success") {
      return respond(result);
    }

    const status =
      result.status === "configuration_error"
        ? 503
        : result.status === "rate_limited"
          ? 429
          : result.status === "analysis_failed"
            ? 422
            : 500;

    return respond(result, { status });
  } catch (error) {
    console.error("AI calendar import route error:", {
      requestId,
      school,
      category: error instanceof Error ? error.name : "unknown",
      durationMs: Date.now() - startedAt,
    });
    return respond(
      {
        status: "server_error",
        message: "Sundial could not analyze this PDF yet. Please continue manually.",
      },
      { status: 500 }
    );
  }
}
