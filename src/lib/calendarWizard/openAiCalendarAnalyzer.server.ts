import "server-only";

import OpenAI, { toFile } from "openai";
import {
  normalizeAiCalendarExtraction,
  type RawAiCalendarExtraction,
} from "./aiCalendarImportNormalizer";
import {
  getAiImportValidationReasonCode,
  summarizeAiImportValidationErrors,
  type AiImportWarning,
} from "./aiImportTypes";
import {
  extractCalendarPdfText,
  type ExtractedCalendarText,
} from "./pdfTextExtraction.server";
import { extractPdfVectorCalendar, type PdfVectorCalendarResult } from "./pdfVectorCalendarExtraction.server";
import { ensureFirstInstructionalAnchor, mergeVectorCalendarAssignments } from "./mergeVectorCalendarAssignments";
import {
  evaluateCalendarTextQuality,
  type CalendarTextQuality,
} from "./pdfTextQuality";
import {
  buildCalendarImportRepairRequest,
  buildCalendarImportResponsesRequest,
  buildCalendarImportTextResponsesRequest,
} from "./openAiCalendarRequest";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";
import {
  AiCalendarImportProcessingError,
  DEFAULT_OPENAI_CALENDAR_MODEL,
  OpenAiCalendarApplicationTimeoutError,
  OpenAiCalendarPdfPreparationError,
  buildAiCalendarProcessingDiagnostics,
  createOpenAiCalendarTimeoutController,
  getOpenAiCalendarConfiguration,
  getOpenAiCalendarPdfTimeoutMs,
  getOpenAiCalendarPdfModel,
  getOpenAiCalendarTextTimeoutMs,
  getOpenAiCalendarTextModel,
  logOpenAiCalendarEnvironmentDiagnostic,
  logOpenAiCalendarDiagnostic,
  mapOpenAiError,
  openAiResponseHasRefusal,
  openAiResponseIncomplete,
  shouldRetryOpenAiError,
  buildOpenAiErrorDiagnostics,
  type OpenAiCalendarAnalysisStage,
  type CalendarAnalyzerResult,
} from "./openAiCalendarAnalyzerUtils";
import type { AiImportServerStage } from "./aiImportProgress";
import {
  AI_IMPORT_MIN_PDF_FALLBACK_BUDGET_MS,
  AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS,
  hasAiImportRepairBudget,
  hasAiImportPdfFallbackBudget,
} from "./aiImportTimeouts";

export { DEFAULT_OPENAI_CALENDAR_MODEL };

type OpenAiResponseUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type AnalysisStrategy = "text-gpt5-mini" | "pdf-gpt5";
type AnalyzerStageCallback = (
  stage: AiImportServerStage,
  strategy?: AnalysisStrategy
) => void | Promise<void>;
type AnalyzerDeadlineController = ReturnType<typeof createOpenAiCalendarTimeoutController>;

function getOpenAiClient(apiKey: string) {
  logOpenAiCalendarEnvironmentDiagnostic("before_openai_client_create");
  return new OpenAI({ apiKey });
}

async function sleepForRetry() {
  await new Promise((resolve) => setTimeout(resolve, 350 + Math.floor(Math.random() * 350)));
}

function parseStructuredOutput(outputText: string): RawAiCalendarExtraction | null {
  try {
    return JSON.parse(outputText) as RawAiCalendarExtraction;
  } catch {
    return null;
  }
}

function applyTargetedRepairs(
  original: RawAiCalendarExtraction,
  repaired: RawAiCalendarExtraction,
  issuePaths: string[]
) {
  const allowed = new Set<string>();
  for (const path of issuePaths) {
    if (path === "dateRanges") {
      allowed.add("noSchoolRanges");
      allowed.add("specialSchoolDays");
    } else if (path.startsWith("schoolYear.startDate")) allowed.add("firstInstructionalDate");
    else if (path.startsWith("schoolYear.endDate")) allowed.add("lastInstructionalDate");
    else if (path.startsWith("schoolYear.operatingWeekdays")) allowed.add("operatingWeekdays");
    else if (path.startsWith("schoolYear.confidence")) allowed.add("schoolYearConfidence");
    else if (path.startsWith("pattern")) allowed.add("normalPattern");
    else if (path.startsWith("specialDays")) allowed.add("specialSchoolDays");
    else allowed.add(path.split(".")[0]);
  }
  return Object.fromEntries(
    Object.entries(original).map(([key, value]) => [
      key,
      allowed.has(key) ? repaired[key as keyof RawAiCalendarExtraction] : value,
    ])
  ) as RawAiCalendarExtraction;
}

function logPipelineDiagnostic(
  event: string,
  payload: Record<string, unknown> = {}
) {
  console.info("AI calendar import diagnostic", {
    event,
    ...payload,
  });
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new OpenAiCalendarApplicationTimeoutError(0);
}

async function withAbortSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortReason(signal);

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(abortReason(signal)), {
        once: true,
      });
    }),
  ]);
}

function startStageHeartbeat(
  onStageChange: AnalyzerStageCallback | undefined,
  stage: AiImportServerStage,
  strategy: AnalysisStrategy
) {
  if (!onStageChange) return () => {};

  const interval = setInterval(() => {
    void onStageChange(stage, strategy);
  }, 25_000);

  return () => clearInterval(interval);
}

function summarizeFinalValidationIssues({
  validationErrors = [],
  warnings = [],
}: {
  validationErrors?: Array<{
    path: string;
    code: string;
    expected: string;
    received: string;
    required: boolean;
  }>;
  warnings?: AiImportWarning[];
}) {
  const schemaIssues = validationErrors.map((error) => ({
    phase: "schema_validation",
    path: error.path,
    code: error.code,
    expectedRule: error.expected,
    receivedPrimitiveType: error.received,
    requiredOrOptional: error.required ? "required" : "optional",
  }));
  const warningIssues = warnings.map((warning) => ({
    phase: "calendar_validation",
    path: "warnings",
    code: warning.code,
    expectedRule: "no blocking calendar warnings",
    receivedPrimitiveType: warning.severity,
    requiredOrOptional: "required",
  }));

  return [...schemaIssues, ...warningIssues];
}

function blockingWarningsToRepairIssues(warnings: AiImportWarning[]) {
  return warnings.map((warning) => ({
    path:
      warning.code === "special_day_outside_school_year"
        ? "specialDays"
        : warning.code === "school_year_dates_reversed"
          ? "schoolYear"
          : "calendar",
    code: warning.code,
    expected:
      "student calendar dates only, excluding staff/personnel/unrelated page dates",
    received: warning.severity,
    required: true,
  }));
}

async function normalizeValidateAndRepair({
  client,
  model,
  raw,
  usage,
  requestId,
  startedAt,
  signal,
  strategy,
  fileUploadSucceeded,
  responsesApiCallBegan,
  onStageChange,
  skipTextScheduleRepair,
}: {
  client: OpenAI;
  model: string;
  raw: RawAiCalendarExtraction;
  usage?: OpenAiResponseUsage;
  requestId?: string | null;
  startedAt: number;
  signal: AbortSignal;
  strategy: AnalysisStrategy;
  fileUploadSucceeded: boolean;
  responsesApiCallBegan: boolean;
  onStageChange?: AnalyzerStageCallback;
  skipTextScheduleRepair?: boolean;
}): Promise<CalendarAnalyzerResult> {
  let normalized: ReturnType<typeof normalizeAiCalendarExtraction>;

  try {
    await onStageChange?.(
      strategy === "text-gpt5-mini" ? "validating_text_result" : "validating_pdf_result",
      strategy
    );
    normalized = normalizeAiCalendarExtraction(raw, {
      source: "openai",
      usage: {
        model,
        requestId: requestId || undefined,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        totalTokens: usage?.total_tokens,
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    const processingError = new AiCalendarImportProcessingError({
      phase: "review_generation",
      reasonCode: "review_generation_failed",
      message: "AI calendar import review generation failed.",
      cause: error,
    });
    console.error(
      "AI calendar import processing error",
      buildAiCalendarProcessingDiagnostics({
        error,
        phase: processingError.phase,
        reasonCode: processingError.reasonCode,
        requestId,
        durationMs: Date.now() - startedAt,
      })
    );
    return mapOpenAiError(processingError);
  }

  let repaired = false;
  if (!normalized.success) {
    const reasonCode = getAiImportValidationReasonCode(normalized.validationErrors);
    if (
      skipTextScheduleRepair &&
      strategy === "text-gpt5-mini" &&
      reasonCode === "missing_required_schedule"
    ) {
      logPipelineDiagnostic("text_analysis_visual_information_required", {
        model,
        strategy,
        requestId,
        phase: "schema_validation",
        reasonCode: "visual_information_required",
        validationIssues: summarizeFinalValidationIssues({
          validationErrors: summarizeAiImportValidationErrors(normalized.validationErrors),
        }),
        durationMs: Date.now() - startedAt,
      });
      return {
        status: "analysis_failed",
        message:
          "This calendar uses visual schedule assignments. Sundial is switching to a deeper review.",
        retryable: true,
        reasonCode: "visual_information_required",
      };
    }

    if (!hasEnoughBudgetForRepair(startedAt)) {
      return insufficientRepairBudgetResult(startedAt);
    }

    await onStageChange?.(
      strategy === "text-gpt5-mini" ? "repairing_text_result" : "repairing_pdf_result",
      strategy
    );
    const repairIssues = summarizeAiImportValidationErrors(normalized.validationErrors);
    logOpenAiCalendarDiagnostic("info", "repair_started", {
      model,
      requestId,
      stage: "normalizing_response",
      fileUploadSucceeded,
      responsesApiCallBegan,
      durationMs: Date.now() - startedAt,
    });
    logPipelineDiagnostic("repair_started", {
      model,
      strategy,
      requestId,
      validationIssueCount: repairIssues.length,
      durationMs: Date.now() - startedAt,
    });
    const stopHeartbeat = startStageHeartbeat(
      onStageChange,
      strategy === "text-gpt5-mini" ? "repairing_text_result" : "repairing_pdf_result",
      strategy
    );
    const { data: repairResponse, request_id: repairRequestId } = await withAbortSignal(
      client.responses
        .create(buildCalendarImportRepairRequest(model, raw, repairIssues), {
          signal,
        })
        .withResponse(),
      signal
    ).finally(stopHeartbeat);
    const repairedRaw = parseStructuredOutput(repairResponse.output_text);
    if (repairedRaw) {
      const targetedRepair = applyTargetedRepairs(
        raw,
        repairedRaw,
        repairIssues.map((issue) => issue.path)
      );
      normalized = normalizeAiCalendarExtraction(targetedRepair, {
        source: "openai",
        usage: {
          model,
          requestId: repairRequestId || requestId || undefined,
          durationMs: Date.now() - startedAt,
        },
      });
      repaired = normalized.success;
    }
    logOpenAiCalendarDiagnostic("info", "repair_finished", {
      model,
      requestId,
      stage: "normalizing_response",
      fileUploadSucceeded,
      responsesApiCallBegan,
      durationMs: Date.now() - startedAt,
      repairedIssueCount: repaired ? repairIssues.length : 0,
      remainingIssueCount: normalized.success ? 0 : normalized.validationErrors.length,
    });
    logPipelineDiagnostic("repair_finished", {
      model,
      strategy,
      requestId,
      repairedIssueCount: repaired ? repairIssues.length : 0,
      remainingIssueCount: normalized.success ? 0 : normalized.validationErrors.length,
      durationMs: Date.now() - startedAt,
    });
  }

  if (!normalized.success) {
    const reasonCode = getAiImportValidationReasonCode(normalized.validationErrors);
    const validationErrors = summarizeAiImportValidationErrors(
      normalized.validationErrors
    );
    console.warn("AI calendar import validation failed", {
      model,
      requestId,
      strategy,
      durationMs: Date.now() - startedAt,
      errorCount: normalized.errors.length,
      phase: "schema_validation",
      reasonCode,
      validationErrors,
      issueCount: validationErrors.length,
      validationIssues: summarizeFinalValidationIssues({ validationErrors }),
    });
    return {
      status: "analysis_failed",
      message: "Sundial read the PDF, but one part of the calendar could not be validated. Retry, or continue manually.",
      retryable: true,
      reasonCode,
    };
  }

  let blockingWarnings = normalized.importResult.warnings.filter(
    (warning) => warning.severity === "blocking"
  );
  if (blockingWarnings.length > 0) {
    const repairIssues = blockingWarningsToRepairIssues(blockingWarnings);
    if (!hasEnoughBudgetForRepair(startedAt)) {
      return insufficientRepairBudgetResult(startedAt);
    }

    await onStageChange?.(
      strategy === "text-gpt5-mini" ? "repairing_text_result" : "repairing_pdf_result",
      strategy
    );
    logPipelineDiagnostic("calendar_validation_failed", {
      model,
      strategy,
      requestId,
      phase: "calendar_validation",
      reasonCode: "calendar_validation_failed",
      issueCount: blockingWarnings.length,
      validationIssues: summarizeFinalValidationIssues({ warnings: blockingWarnings }),
      durationMs: Date.now() - startedAt,
    });
    logPipelineDiagnostic("repair_started", {
      model,
      strategy,
      requestId,
      phase: "calendar_validation",
      validationIssueCount: repairIssues.length,
      durationMs: Date.now() - startedAt,
    });
    const stopHeartbeat = startStageHeartbeat(
      onStageChange,
      strategy === "text-gpt5-mini" ? "repairing_text_result" : "repairing_pdf_result",
      strategy
    );
    const { data: repairResponse, request_id: repairRequestId } = await withAbortSignal(
      client.responses
        .create(buildCalendarImportRepairRequest(model, raw, repairIssues), {
          signal,
        })
        .withResponse(),
      signal
    ).finally(stopHeartbeat);
    const repairedRaw = parseStructuredOutput(repairResponse.output_text);
    if (repairedRaw) {
      normalized = normalizeAiCalendarExtraction(repairedRaw, {
        source: "openai",
        usage: {
          model,
          requestId: repairRequestId || requestId || undefined,
          durationMs: Date.now() - startedAt,
        },
      });
      if (normalized.success) {
        repaired = true;
        blockingWarnings = normalized.importResult.warnings.filter(
          (warning) => warning.severity === "blocking"
        );
      }
    }
    logPipelineDiagnostic("repair_finished", {
      model,
      strategy,
      requestId,
      phase: "calendar_validation",
      repairedIssueCount: blockingWarnings.length === 0 ? repairIssues.length : 0,
      remainingIssueCount: blockingWarnings.length,
      durationMs: Date.now() - startedAt,
    });
  }

  if (!normalized.success) {
    const validationErrors = summarizeAiImportValidationErrors(
      normalized.validationErrors
    );
    console.warn("AI calendar import validation failed", {
      model,
      requestId,
      strategy,
      durationMs: Date.now() - startedAt,
      errorCount: normalized.errors.length,
      phase: "calendar_validation_repair",
      reasonCode: getAiImportValidationReasonCode(normalized.validationErrors),
      validationErrors,
      issueCount: validationErrors.length,
      validationIssues: summarizeFinalValidationIssues({ validationErrors }),
    });
    return {
      status: "analysis_failed",
      message: "Sundial read the PDF, but one part of the calendar could not be validated. Retry, or continue manually.",
      retryable: true,
      reasonCode: getAiImportValidationReasonCode(normalized.validationErrors),
    };
  }

  if (blockingWarnings.length > 0) {
    console.warn("AI calendar import validation failed", {
      model,
      requestId,
      strategy,
      durationMs: Date.now() - startedAt,
      phase: "calendar_validation",
      reasonCode: "calendar_validation_failed",
      issueCount: blockingWarnings.length,
      validationIssues: summarizeFinalValidationIssues({ warnings: blockingWarnings }),
    });
    return {
      status: "analysis_failed",
      message: "Sundial could not safely determine the school-year calendar from this PDF.",
      retryable: false,
      reasonCode: "calendar_validation_failed",
    };
  }

  return {
    status: "success",
    importResult: normalized.importResult,
    analysisStrategy: strategy,
    outcome: repaired
      ? "repaired"
      : normalized.importResult.warnings.some((warning) => warning.severity === "review")
        ? "reviewable"
        : "successful",
  };
}

async function analyzeCalendarText({
  client,
  extracted,
  model,
  deadline,
  startedAt,
  onStageChange,
}: {
  client: OpenAI;
  extracted: ExtractedCalendarText;
  model: string;
  deadline: AnalyzerDeadlineController;
  startedAt: number;
  onStageChange?: AnalyzerStageCallback;
}): Promise<CalendarAnalyzerResult> {
  let responsesApiCallBegan = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await onStageChange?.("analyzing_text", "text-gpt5-mini");
      logPipelineDiagnostic("text_analysis_started", {
        model,
        strategy: "text-gpt5-mini",
        pageCount: extracted.pageCount,
        extractedCharacterCount: extracted.extractedCharacterCount,
        extractedLineCount: extracted.extractedLineCount,
        durationMs: Date.now() - startedAt,
      });
      responsesApiCallBegan = true;
      logOpenAiCalendarEnvironmentDiagnostic("before_responses_api_call");
      const stopHeartbeat = startStageHeartbeat(
        onStageChange,
        "analyzing_text",
        "text-gpt5-mini"
      );
      const { data: response, request_id: requestId } = await withAbortSignal(
        client.responses
          .create(buildCalendarImportTextResponsesRequest(model, extracted.text), {
            signal: deadline.controller.signal,
          })
          .withResponse(),
        deadline.controller.signal
      ).finally(stopHeartbeat);

      if (openAiResponseIncomplete(response) || openAiResponseHasRefusal(response)) {
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF text but could not build a reliable calendar draft.",
          retryable: true,
          reasonCode: "malformed_calendar_structure",
        };
      }

      const raw = parseStructuredOutput(response.output_text);
      if (!raw) {
        logPipelineDiagnostic("text_validation_failed", {
          model,
          strategy: "text-gpt5-mini",
          requestId,
          validationIssueCount: 1,
          fallbackReasonCode: "malformed_calendar_structure",
          durationMs: Date.now() - startedAt,
        });
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF text, but the AI response did not match the calendar format we need.",
          retryable: true,
          reasonCode: "ai_schema_validation_failed",
        };
      }

      const result = await normalizeValidateAndRepair({
        client,
        model,
        raw,
        usage: response.usage,
        requestId,
        startedAt,
        signal: deadline.controller.signal,
        strategy: "text-gpt5-mini",
        fileUploadSucceeded: false,
        responsesApiCallBegan,
        onStageChange,
        skipTextScheduleRepair: true,
      });

      logPipelineDiagnostic("text_analysis_finished", {
        model,
        strategy: "text-gpt5-mini",
        requestId,
        status: result.status,
        reasonCode: result.status === "success" ? undefined : result.reasonCode,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        totalTokens: response.usage?.total_tokens,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const handledError = deadline.timedOut
        ? new OpenAiCalendarApplicationTimeoutError(deadline.timeoutMs)
        : error;

      if (!deadline.timedOut && shouldRetryOpenAiError(error, attempt)) {
        console.warn(
          "AI calendar import text-path transient error; retrying",
          buildOpenAiErrorDiagnostics(handledError, {
            model,
            stage: "creating_response",
            fileUploadSucceeded: false,
            responsesApiCallBegan,
            durationMs: Date.now() - startedAt,
          })
        );
        await sleepForRetry();
        continue;
      }

      console.warn(
        "AI calendar import text-path OpenAI error",
        buildOpenAiErrorDiagnostics(handledError, {
          model,
          stage: "creating_response",
          fileUploadSucceeded: false,
          responsesApiCallBegan,
          durationMs: Date.now() - startedAt,
        })
      );
      return mapOpenAiError(handledError);
    }
  }

  return {
    status: "analysis_failed",
    message: "AI calendar import is temporarily unavailable. Please try again shortly.",
    retryable: true,
  };
}

async function analyzeCalendarPdfFallback({
  client,
  file,
  model,
  deadline,
  startedAt,
  onStageChange,
  directVisualStrategy = false,
}: {
  client: OpenAI;
  file: File;
  model: string;
  deadline: AnalyzerDeadlineController;
  startedAt: number;
  onStageChange?: AnalyzerStageCallback;
  directVisualStrategy?: boolean;
}): Promise<CalendarAnalyzerResult> {
  let stage: OpenAiCalendarAnalysisStage = "preparing_file";
  let fileUploadSucceeded = false;
  let responsesApiCallBegan = false;
  let uploadableFile: Awaited<ReturnType<typeof toFile>>;
  try {
    uploadableFile = await toFile(file, file.name || "calendar.pdf", {
      type: "application/pdf",
    });
  } catch {
    return mapOpenAiError(new OpenAiCalendarPdfPreparationError());
  }
  let openAiFileId: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (!directVisualStrategy) {
        await onStageChange?.("falling_back_to_pdf", "pdf-gpt5");
      }
      logPipelineDiagnostic("pdf_fallback_started", {
        model,
        strategy: "pdf-gpt5",
        directVisualStrategy,
        durationMs: Date.now() - startedAt,
      });
      logOpenAiCalendarDiagnostic("info", "openai_attempt_started", {
        model,
        stage,
        fileUploadSucceeded,
        responsesApiCallBegan,
        durationMs: Date.now() - startedAt,
      });

      stage = "uploading_file";
      await onStageChange?.("uploading_pdf_to_ai", "pdf-gpt5");
      const uploaded = await withAbortSignal(
        client.files.create(
          {
            file: uploadableFile,
            purpose: "user_data",
          },
          { signal: deadline.controller.signal }
        ),
        deadline.controller.signal
      );
      openAiFileId = uploaded.id;
      fileUploadSucceeded = true;
      stage = "file_uploaded";
      logOpenAiCalendarDiagnostic("info", "openai_file_uploaded", {
        model,
        stage,
        fileUploadSucceeded,
        responsesApiCallBegan,
        durationMs: Date.now() - startedAt,
      });

      stage = "creating_response";
      responsesApiCallBegan = true;
      await onStageChange?.("analyzing_pdf", "pdf-gpt5");
      logOpenAiCalendarEnvironmentDiagnostic("before_responses_api_call");
      const stopHeartbeat = startStageHeartbeat(
        onStageChange,
        "analyzing_pdf",
        "pdf-gpt5"
      );
      const { data: response, request_id: requestId } = await withAbortSignal(
        client.responses
          .create(
            buildCalendarImportResponsesRequest(model, uploaded.id),
            { signal: deadline.controller.signal }
          )
          .withResponse(),
        deadline.controller.signal
      ).finally(stopHeartbeat);

      stage = "reading_response";
      if (openAiResponseIncomplete(response) || openAiResponseHasRefusal(response)) {
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF but could not build a reliable calendar draft. You can try another PDF or continue manually.",
          retryable: true,
        };
      }

      const raw = parseStructuredOutput(response.output_text);
      if (!raw) {
        logOpenAiCalendarDiagnostic("warn", "openai_malformed_json_response", {
          model,
          stage,
          fileUploadSucceeded,
          responsesApiCallBegan,
          durationMs: Date.now() - startedAt,
          requestId,
        });
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF, but the AI response did not match the calendar format we need. Try again or continue manually.",
          retryable: true,
          reasonCode: "ai_schema_validation_failed",
        };
      }

      const result = await normalizeValidateAndRepair({
        client,
        model,
        raw,
        usage: response.usage,
        requestId,
        startedAt,
        signal: deadline.controller.signal,
        strategy: "pdf-gpt5",
        fileUploadSucceeded,
        responsesApiCallBegan,
        onStageChange,
      });

      logPipelineDiagnostic("pdf_fallback_finished", {
        model,
        strategy: "pdf-gpt5",
        requestId,
        status: result.status,
        reasonCode: result.status === "success" ? undefined : result.reasonCode,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        totalTokens: response.usage?.total_tokens,
        durationMs: Date.now() - startedAt,
      });

      return result;
    } catch (error) {
      const handledError = deadline.timedOut
        ? new OpenAiCalendarApplicationTimeoutError(deadline.timeoutMs)
        : error;

      if (!deadline.timedOut && shouldRetryOpenAiError(error, attempt)) {
        console.warn(
          "AI calendar import OpenAI transient error; retrying",
          buildOpenAiErrorDiagnostics(handledError, {
            model,
            stage,
            fileUploadSucceeded,
            responsesApiCallBegan,
            durationMs: Date.now() - startedAt,
          })
        );
        await sleepForRetry();
        continue;
      }

      console.warn(
        "AI calendar import OpenAI error",
        buildOpenAiErrorDiagnostics(handledError, {
          model,
          stage,
          fileUploadSucceeded,
          responsesApiCallBegan,
          durationMs: Date.now() - startedAt,
        })
      );
      return mapOpenAiError(handledError);
    } finally {
      if (openAiFileId) {
        try {
          await client.files.delete(openAiFileId);
        } catch (deleteError) {
          console.warn("AI calendar import file cleanup failed", {
            fileId: openAiFileId,
            category: deleteError instanceof Error ? deleteError.name : "unknown",
          });
        }
        openAiFileId = null;
      }
    }
  }

  return {
    status: "analysis_failed",
    message: "AI calendar import is temporarily unavailable. Please try again shortly.",
    retryable: true,
  };
}

function shouldFallbackAfterTextResult(result: CalendarAnalyzerResult) {
  return (
    result.status === "analysis_failed" &&
    result.reasonCode !== undefined &&
    [
      "ai_schema_validation_failed",
      "schema_validation_failed",
      "calendar_validation_failed",
      "missing_required_schedule",
      "invalid_date_range",
      "invalid_schedule_reference",
      "malformed_calendar_structure",
      "visual_information_required",
    ].includes(result.reasonCode)
  );
}

function hasEnoughBudgetForPdfFallback(startedAt: number) {
  return hasAiImportPdfFallbackBudget(Date.now() - startedAt);
}

function hasEnoughBudgetForRepair(startedAt: number) {
  return hasAiImportRepairBudget(Date.now() - startedAt);
}

function insufficientRepairBudgetResult(startedAt: number): CalendarAnalyzerResult {
  logPipelineDiagnostic("repair_skipped_insufficient_budget", {
    elapsedMs: Date.now() - startedAt,
    routeBudgetMs: AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS,
    reasonCode: "openai_timeout",
  });

  return {
    status: "analysis_failed",
    message: "The calendar analysis took too long to complete. Retry, or continue manually.",
    retryable: true,
    reasonCode: "openai_timeout",
  };
}

function insufficientFallbackBudgetResult(startedAt: number): CalendarAnalyzerResult {
  logPipelineDiagnostic("pdf_fallback_skipped_insufficient_budget", {
    elapsedMs: Date.now() - startedAt,
    routeBudgetMs: AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS,
    minimumFallbackBudgetMs: AI_IMPORT_MIN_PDF_FALLBACK_BUDGET_MS,
    reasonCode: "openai_timeout",
  });

  return {
    status: "analysis_failed",
    message: "The calendar analysis took too long to complete. Retry, or continue manually.",
    retryable: true,
    reasonCode: "openai_timeout",
  };
}

export async function analyzeCalendarPdf(
  file: File,
  options: { onStageChange?: AnalyzerStageCallback; requestId?: string } = {}
): Promise<CalendarAnalyzerResult> {
  const configuration = getOpenAiCalendarConfiguration();

  if (configuration.ok && configuration.mode === "mock") {
    return {
      status: "success",
      importResult: createMockAiCalendarImportResult(),
    };
  }

  if (!configuration.ok) {
    return {
      status: "configuration_error",
      message: configuration.message,
      reasonCode: configuration.reasonCode,
    };
  }

  const client = getOpenAiClient(configuration.apiKey);
  const startedAt = Date.now();
  const textModel = getOpenAiCalendarTextModel();
  const pdfModel = getOpenAiCalendarPdfModel();
  const textTimeoutMs = getOpenAiCalendarTextTimeoutMs();
  const pdfTimeoutMs = getOpenAiCalendarPdfTimeoutMs();
  let extracted: ExtractedCalendarText | null = null;
  let quality: CalendarTextQuality | null = null;
  let vectorResult: PdfVectorCalendarResult | null = null;

  try {
    await options.onStageChange?.("extracting_text", "text-gpt5-mini");
    logPipelineDiagnostic("pdf_text_extraction_started", {
      fileSize: file.size,
      durationMs: Date.now() - startedAt,
    });
    const [textExtraction, vectorExtraction] = await Promise.allSettled([
      extractCalendarPdfText(file),
      extractPdfVectorCalendar(file),
    ]);
    if (textExtraction.status === "rejected") throw textExtraction.reason;
    extracted = textExtraction.value;
    if (vectorExtraction.status === "fulfilled") {
      vectorResult = vectorExtraction.value;
      logPipelineDiagnostic("pdf_vector_extraction_finished", {
        supported: vectorResult.supported,
        confidence: vectorResult.confidence,
        assignmentCount: vectorResult.assignments.length,
        legendCount: vectorResult.legend.length,
        reasonCodes: vectorResult.reasonCodes,
        durationMs: vectorResult.durationMs,
      });
    } else {
      logPipelineDiagnostic("pdf_vector_extraction_failed", {
        category: vectorExtraction.reason instanceof Error ? vectorExtraction.reason.name : "unknown",
        durationMs: Date.now() - startedAt,
      });
    }
    await options.onStageChange?.("evaluating_text_quality", "text-gpt5-mini");
    quality = evaluateCalendarTextQuality({
      text: extracted.text,
      pageCount: extracted.pageCount,
    });
    logPipelineDiagnostic("text_quality_evaluated", {
      pageCount: extracted.pageCount,
      extractedCharacterCount: extracted.extractedCharacterCount,
      extractedLineCount: extracted.extractedLineCount,
      textQualityScore: quality.score,
      textQualityReasonCodes: quality.reasonCodes,
      likelyVisualLayoutDependency: quality.likelyVisualLayoutDependency,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logPipelineDiagnostic("text_quality_evaluated", {
      textQualityScore: 0,
      textQualityReasonCodes: ["no_text_layer"],
      fallbackReasonCode: error instanceof Error ? error.message : "text_extraction_failed",
      durationMs: Date.now() - startedAt,
    });
  }

  const directVisualStrategy = Boolean(extracted && quality?.likelyVisualLayoutDependency);
  await options.onStageChange?.("selecting_strategy", "text-gpt5-mini");

  if (extracted && (quality?.usable || vectorResult?.supported)) {
    const textDeadline = createOpenAiCalendarTimeoutController(
      textTimeoutMs,
      "openai_timeout"
    );
    let textResult: CalendarAnalyzerResult;
    try {
      textResult = await analyzeCalendarText({
        client,
        extracted,
        model: textModel,
        deadline: textDeadline,
        startedAt,
        onStageChange: options.onStageChange,
      });
    } finally {
      textDeadline.clear();
    }

    if (textResult.status === "success" || !shouldFallbackAfterTextResult(textResult)) {
      if (textResult.status === "success" && vectorResult?.supported) {
        textResult = {
          ...textResult,
          importResult: mergeVectorCalendarAssignments(textResult.importResult, vectorResult),
        };
      }
      if (textResult.status === "success") {
        textResult = {
          ...textResult,
          importResult: ensureFirstInstructionalAnchor(textResult.importResult),
        };
      }
      logPipelineDiagnostic(
        textResult.status === "success" ? "import_ready" : "import_confirmed_failed",
        {
          strategy: "text-gpt5-mini",
          model: textModel,
          status: textResult.status,
          reasonCode: textResult.status === "success" ? undefined : textResult.reasonCode,
          durationMs: Date.now() - startedAt,
        }
      );
      return textResult;
    }

    // A high-confidence vector result already contains the visual schedule truth.
    // Never replace it with a slower full-PDF inference merely because metadata analysis failed.
    if (vectorResult?.supported) {
      logPipelineDiagnostic("pdf_fallback_suppressed_by_vector_result", {
        vectorConfidence: vectorResult.confidence,
        assignmentCount: vectorResult.assignments.length,
        textReasonCode: textResult.reasonCode,
        durationMs: Date.now() - startedAt,
      });
      return {
        status: "analysis_failed",
        message: "Sundial read the calendar colors reliably, but could not finish the calendar metadata. Retry the import; the full-PDF model was not used.",
        retryable: true,
        reasonCode: textResult.reasonCode || "metadata_analysis_failed",
      };
    }

    if (!hasEnoughBudgetForPdfFallback(startedAt)) {
      return insufficientFallbackBudgetResult(startedAt);
    }

    logPipelineDiagnostic("pdf_fallback_started", {
      strategy: "pdf-gpt5",
      model: pdfModel,
      fallbackReasonCode:
        textResult.reasonCode === "visual_information_required"
          ? "visual_information_required"
          : textResult.reasonCode,
      durationMs: Date.now() - startedAt,
    });
  } else if (directVisualStrategy) {
    if (!hasEnoughBudgetForPdfFallback(startedAt)) {
      return insufficientFallbackBudgetResult(startedAt);
    }

    logPipelineDiagnostic("pdf_visual_analysis_selected", {
      strategy: "pdf-gpt5",
      model: pdfModel,
      fallbackReasonCode: quality?.reasonCodes.includes("visual_schedule_legend")
        ? "visual_schedule_legend"
        : quality?.reasonCodes.includes("schedule_names_without_text_mapping")
          ? "visual_schedule_legend"
          : quality?.reasonCodes[0] || "visual_schedule_legend",
      textQualityScore: quality?.score,
      textQualityReasonCodes: quality?.reasonCodes,
      durationMs: Date.now() - startedAt,
    });
  } else {
    if (!hasEnoughBudgetForPdfFallback(startedAt)) {
      return insufficientFallbackBudgetResult(startedAt);
    }

    logPipelineDiagnostic("pdf_fallback_started", {
      strategy: "pdf-gpt5",
      model: pdfModel,
      fallbackReasonCode: quality?.reasonCodes.join(",") || "text_extraction_failed",
      durationMs: Date.now() - startedAt,
    });
  }

	  await options.onStageChange?.("preparing_visual_analysis", "pdf-gpt5");
  logPipelineDiagnostic("pdf_fallback_explanation", {
    message: "This calendar’s visual layout could not be read reliably, so Sundial is performing a deeper review.",
    durationMs: Date.now() - startedAt,
  });
  const pdfDeadline = createOpenAiCalendarTimeoutController(
    pdfTimeoutMs,
    "pdf_analysis_timeout"
  );
  let pdfResult: CalendarAnalyzerResult;
  try {
    pdfResult = await analyzeCalendarPdfFallback({
      client,
      file,
      model: pdfModel,
      deadline: pdfDeadline,
      startedAt,
      onStageChange: options.onStageChange,
      directVisualStrategy,
    });
  } finally {
    pdfDeadline.clear();
  }
  logPipelineDiagnostic(
    pdfResult.status === "success" ? "import_ready" : "import_confirmed_failed",
    {
      strategy: "pdf-gpt5",
      model: pdfModel,
      status: pdfResult.status,
      reasonCode: pdfResult.status === "success" ? undefined : pdfResult.reasonCode,
      durationMs: Date.now() - startedAt,
    }
  );
  return pdfResult;
}
