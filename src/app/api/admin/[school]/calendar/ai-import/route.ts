import { NextResponse } from "next/server";
import { canAccessAdminSection } from "@/lib/auth/adminPermissions";
import type { AnalyzeCalendarPdfResult } from "@/lib/calendarWizard/aiImportTypes";
import { validateCalendarPdfFile } from "@/lib/calendarWizard/aiPdfValidation";
import { analyzeCalendarPdf } from "@/lib/calendarWizard/openAiCalendarAnalyzer.server";
import {
  AI_CALENDAR_PDF_STRATEGY,
  AI_CALENDAR_PROMPT_SCHEMA_VERSION,
  AI_CALENDAR_TEXT_STRATEGY,
  claimCalendarAnalysisAttempt,
  dedupeCalendarAnalysis,
  invalidateCalendarAnalysisCache,
  readCalendarAnalysisCacheEntry,
  recordCalendarAnalysisFailure,
  setCalendarAnalysisStage,
  writeCalendarAnalysisCache,
  type CalendarAnalysisCacheKey,
} from "@/lib/calendarWizard/aiCalendarAnalysisCache.server";
import type { AiImportServerStage } from "@/lib/calendarWizard/aiImportProgress";
import {
  getOpenAiCalendarPdfModel,
  getOpenAiCalendarTextModel,
  logOpenAiCalendarEnvironmentDiagnostic,
} from "@/lib/calendarWizard/openAiCalendarAnalyzerUtils";
import { AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS } from "@/lib/calendarWizard/aiImportTimeouts";
import { getSchoolForSetup } from "@/lib/schools";
import { extractPdfVectorCalendar } from "@/lib/calendarWizard/pdfVectorCalendarExtraction.server";
import { computeDatedScheduleAssignmentDigest } from "@/lib/calendarWizard/assignmentDigest";
import { computeCalendarClassificationDigest } from "@/lib/calendarWizard/assignmentDigest";
import { buildAiPreviewConfig } from "@/lib/calendarWizard/aiImportPreview";
import { generateSchoolYearCalendar } from "@/lib/calendarWizard/generateSchoolYearCalendar";
import { classifyCalendarWarnings } from "@/lib/calendarWizard/aiQuickSetupPersistence";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ school: string }>;
};

type AiImportCacheMode = "default" | "bypass" | "invalidate_and_analyze";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AiImportRouteDeadlineError extends Error {
  constructor() {
    super("AI calendar import route exceeded its processing deadline.");
    this.name = "AiImportRouteDeadlineError";
  }
}

function createAiImportRouteDeadline() {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const promise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new AiImportRouteDeadlineError()), AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS);
  });

  return {
    promise,
    clear() {
      if (timeout) clearTimeout(timeout);
    },
  };
}

function json(result: AnalyzeCalendarPdfResult, init?: ResponseInit) {
  return NextResponse.json(result, init);
}

function logAiImportRouteDiagnostic({
  level = "info",
  event,
  requestId,
  analysisAttemptId,
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
  analysisAttemptId?: string;
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
    analysisAttemptId,
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

  return {
    preferred: [pdfKey, textKey],
    byStrategy: {
      [AI_CALENDAR_PDF_STRATEGY]: pdfKey,
      [AI_CALENDAR_TEXT_STRATEGY]: textKey,
    },
  };
}

function parseCacheMode(formData: FormData): AiImportCacheMode {
  const cacheMode = formData.get("cacheMode");
  if (
    cacheMode === "default" ||
    cacheMode === "bypass" ||
    cacheMode === "invalidate_and_analyze"
  ) {
    return cacheMode;
  }

  return formData.get("analyzeAgain") === "true" ? "bypass" : "default";
}

export async function POST(request: Request, context: RouteContext) {
  const { school } = await context.params;
  const requestId = crypto.randomUUID();
  let analysisAttemptId = crypto.randomUUID();
  const startedAt = Date.now();
  const respond = (result: AnalyzeCalendarPdfResult, init?: ResponseInit) =>
    json(result, {
      ...init,
      headers: {
        ...(init?.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : init?.headers),
        "x-sundial-ai-import-request-id": requestId,
        "x-sundial-ai-import-attempt-id": analysisAttemptId,
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
    const submittedAttemptId = formData.get("analysisAttemptId");
    const cacheMode = parseCacheMode(formData);
    if (typeof submittedAttemptId === "string" && UUID_PATTERN.test(submittedAttemptId)) {
      analysisAttemptId = submittedAttemptId;
    }

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

    let earlyPdfHash: string | null = null;
    let uploadBytes: ArrayBuffer | null = null;
    let attemptClaimRejected = false;
    try {
      uploadBytes = await upload.arrayBuffer();
      earlyPdfHash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", uploadBytes))
      )
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const earlyCacheKeys = getCacheKeys({
        schoolId: schoolData.id,
        pdfHash: earlyPdfHash,
      });
      if (cacheMode === "default") {
        for (const cacheKey of earlyCacheKeys.preferred) {
          const cached = await readCalendarAnalysisCacheEntry(cacheKey);
          if (cached) {
            logAiImportRouteDiagnostic({
              event: "verified_cache_hit", requestId, analysisAttemptId, school,
              durationMs: Date.now() - startedAt, status: "success",
            });
            return respond({
              status: "success",
              importResult: cached.result,
              analysisStrategy: cached.strategy as "text-gpt5-mini" | "pdf-gpt5",
              outcome: cached.result.warnings.some((warning) => warning.severity === "review")
                ? "reviewable"
                : "successful",
              cache: {
                hit: true,
                analyzedAt: cached.createdAt,
                strategy: cached.strategy as "text-gpt5-mini" | "pdf-gpt5",
                version: cached.analyzerVersion,
              },
            });
          }
        }
      }
      const claims = await Promise.all(earlyCacheKeys.preferred.map((cacheKey) =>
        claimCalendarAnalysisAttempt(cacheKey, analysisAttemptId, requestId, startedAt)
      ));
      attemptClaimRejected = claims.some((claimed) => !claimed);
      if (attemptClaimRejected) throw new Error("analysis_attempt_superseded");
      await Promise.all(
        earlyCacheKeys.preferred.map((cacheKey) =>
          setCalendarAnalysisStage(cacheKey, "upload_received", {
            routeRequestId: requestId,
            analysisAttemptId,
            elapsedMs: Date.now() - startedAt,
          })
        )
      );
      await Promise.all(
        earlyCacheKeys.preferred.map((cacheKey) =>
          setCalendarAnalysisStage(cacheKey, "validating_pdf", {
            routeRequestId: requestId,
            analysisAttemptId,
            elapsedMs: Date.now() - startedAt,
          })
        )
      );
    } catch {
      // Validation below will produce the safe client-facing error.
    }
    if (attemptClaimRejected) {
      logAiImportRouteDiagnostic({
        level: "warn", event: "attempt_claim_rejected", requestId,
        analysisAttemptId, school, durationMs: Date.now() - startedAt,
        reasonCode: "analysis_attempt_superseded",
      });
      return respond({
        status: "analysis_failed",
        message: "A newer calendar analysis has already started.",
        retryable: false,
        reasonCode: "analysis_attempt_superseded",
      }, { status: 409 });
    }

    let validation;
    try {
      validation = await validateCalendarPdfFile(upload);
    } catch {
      if (earlyPdfHash) {
        await Promise.all(
          getCacheKeys({ schoolId: schoolData.id, pdfHash: earlyPdfHash }).preferred.map(
            (cacheKey) => recordCalendarAnalysisFailure(cacheKey, "pdf_validation_failed", analysisAttemptId)
          )
        );
      }
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
      if (earlyPdfHash) {
        await Promise.all(
          getCacheKeys({ schoolId: schoolData.id, pdfHash: earlyPdfHash }).preferred.map(
            (cacheKey) => recordCalendarAnalysisFailure(cacheKey, "pdf_validation_failed", analysisAttemptId)
          )
        );
      }
      logAiImportRouteDiagnostic({
        level: "warn",
        event: "upload_rejected",
        requestId,
        analysisAttemptId,
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

    const pdfHash =
      earlyPdfHash ||
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            uploadBytes || (await upload.arrayBuffer())
          )
        )
      )
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    const cacheKeys = getCacheKeys({ schoolId: schoolData.id, pdfHash });
    for (const cacheKey of cacheKeys.preferred) {
      await setCalendarAnalysisStage(cacheKey, "hashing_pdf", {
        routeRequestId: requestId,
        analysisAttemptId,
        elapsedMs: Date.now() - startedAt,
      });
    }

    if (cacheMode === "invalidate_and_analyze") {
      await invalidateCalendarAnalysisCache(
        cacheKeys.preferred,
        "user_requested_reanalysis"
      );
      logAiImportRouteDiagnostic({
        event: "cache_invalidated",
        requestId,
        school,
        durationMs: Date.now() - startedAt,
        reasonCode: "user_requested_reanalysis",
      });
    }

    // Every upload always analyzes fresh: a previously cached result is never served in
    // place of a new analysis, even for the exact same PDF/strategy/model/version. The
    // cache table below is still written to and still backs in-flight progress polling and
    // refresh recovery for *this* attempt — it just never short-circuits a new one.

    logAiImportRouteDiagnostic({
      event: "analysis_started",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
      fileSize: upload.size,
      fileType: upload.type || "unknown",
    });
    const pipelineKey = cacheKeys.byStrategy[AI_CALENDAR_PDF_STRATEGY];
    const setStage = async (
      stage: AiImportServerStage,
      strategy = AI_CALENDAR_PDF_STRATEGY
    ) => {
      const cacheKey =
        strategy === AI_CALENDAR_TEXT_STRATEGY
          ? cacheKeys.byStrategy[AI_CALENDAR_TEXT_STRATEGY]
          : cacheKeys.byStrategy[AI_CALENDAR_PDF_STRATEGY];
      await setCalendarAnalysisStage(cacheKey, stage, {
        routeRequestId: requestId,
        analysisAttemptId,
        strategy,
        elapsedMs: Date.now() - startedAt,
      });
    };
    const routeDeadline = createAiImportRouteDeadline();
    let result: AnalyzeCalendarPdfResult;
    try {
      result = await Promise.race([
        dedupeCalendarAnalysis(
          pipelineKey,
          () => analyzeCalendarPdf(upload, { onStageChange: setStage, requestId })
        ),
        routeDeadline.promise,
      ]);
    } catch (error) {
      if (error instanceof AiImportRouteDeadlineError) {
        for (const cacheKey of cacheKeys.preferred) {
          await recordCalendarAnalysisFailure(cacheKey, "openai_timeout", analysisAttemptId);
        }
        logAiImportRouteDiagnostic({
          level: "warn",
          event: "analyzer_timeout_failed",
          requestId,
          school,
          durationMs: Date.now() - startedAt,
          status: "analysis_failed",
          reasonCode: "openai_timeout",
          fileSize: upload.size,
          fileType: upload.type || "unknown",
        });
        return respond(
          {
            status: "analysis_failed",
            message: "The calendar analysis took too long to complete. Retry, or continue manually.",
            retryable: true,
            reasonCode: "openai_timeout",
          },
          { status: 504 }
        );
      }
      throw error;
    } finally {
      routeDeadline.clear();
    }
    const resultCacheKey =
      result.status === "success" && result.analysisStrategy === AI_CALENDAR_TEXT_STRATEGY
        ? cacheKeys.byStrategy[AI_CALENDAR_TEXT_STRATEGY]
        : cacheKeys.byStrategy[AI_CALENDAR_PDF_STRATEGY];
    if (result.status === "success") {
      console.info("AI calendar assignment transformation", {
        stage: "route_result",
        analysisAttemptId,
        draftAssignmentDigest: await computeDatedScheduleAssignmentDigest(
          result.importResult.datedScheduleAssignments || []
        ),
        assignmentCount: result.importResult.datedScheduleAssignments?.length || 0,
      });
      await setCalendarAnalysisStage(resultCacheKey, "generating_calendar_preview", {
        routeRequestId: requestId,
        analysisAttemptId,
        strategy: resultCacheKey.strategy,
        elapsedMs: Date.now() - startedAt,
      });
      await setCalendarAnalysisStage(resultCacheKey, "saving_result", {
        routeRequestId: requestId,
        analysisAttemptId,
        strategy: resultCacheKey.strategy,
        elapsedMs: Date.now() - startedAt,
      });
      await writeCalendarAnalysisCache(resultCacheKey, result.importResult, analysisAttemptId);
      await setCalendarAnalysisStage(resultCacheKey, "ready", {
        routeRequestId: requestId,
        analysisAttemptId,
        strategy: resultCacheKey.strategy,
        elapsedMs: Date.now() - startedAt,
      });
    }
    if (result.status !== "success") {
      for (const cacheKey of cacheKeys.preferred) {
        await recordCalendarAnalysisFailure(cacheKey, result.reasonCode || result.status, analysisAttemptId);
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

// Non-HTTP production smoke hook. The benchmark script loads the built route module and calls
// this property, ensuring it exercises the exact Turbopack output deployed for this handler.
// Next only exposes POST over HTTP; this property is not a route method.
Object.assign(POST, {
  __runBuiltVectorBenchmark: extractPdfVectorCalendar,
  __runBuiltFullAnalyzerBenchmark: async (file: File) => {
    const stageTimeline: Array<{ stage: string; strategy?: string; elapsedMs: number }> = [];
    const startedAt = Date.now();
    const result = await analyzeCalendarPdf(file, {
      requestId: crypto.randomUUID(),
      onStageChange(stage, strategy) {
        stageTimeline.push({ stage, strategy, elapsedMs: Date.now() - startedAt });
      },
    });
    if (result.status !== "success") {
      return { result, elapsedMs: Date.now() - startedAt, stageTimeline };
    }
    const preview = generateSchoolYearCalendar(buildAiPreviewConfig(result.importResult));
    const scheduleNameForId = (id: string) =>
      result.importResult.detectedSchedules.find((schedule) => schedule.tempId === id)?.detectedName;
    const classified = classifyCalendarWarnings([
      ...result.importResult.warnings,
      ...preview.warnings,
    ]);
    return {
      result,
      elapsedMs: Date.now() - startedAt,
      stageTimeline,
      summary: {
        selectedPages: result.importResult.pageSelection?.selectedPages || [],
        excludedPages: result.importResult.pageSelection?.excludedPages || [],
        analysisRoute: result.analysisStrategy,
        model: result.importResult.usage?.model,
        vectorExtractionStatus: result.importResult.vectorExtraction?.status || "not_reported",
        fullPdfFallbackUsed: result.analysisStrategy === AI_CALENDAR_PDF_STRATEGY,
        instructionalDayCount: preview.summary.instructionalDayCount,
        schedulesDetected: result.importResult.detectedSchedules
          .map((schedule) => schedule.detectedName).sort(),
        blockerCodes: classified.blockingWarnings.map((issue) => issue.issueCode).sort(),
        reviewItemCodes: classified.needsReviewWarnings.map((issue) => issue.issueCode).sort(),
        assignmentDigest: await computeDatedScheduleAssignmentDigest(
          result.importResult.datedScheduleAssignments || []
        ),
        classificationDigest: await computeCalendarClassificationDigest(
          preview.days,
          scheduleNameForId
        ),
      },
    };
  },
});
