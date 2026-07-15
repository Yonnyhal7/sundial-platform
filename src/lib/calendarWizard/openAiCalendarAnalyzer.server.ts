import "server-only";

import OpenAI, { toFile } from "openai";
import {
  normalizeAiCalendarExtraction,
  type RawAiCalendarExtraction,
} from "./aiCalendarImportNormalizer";
import {
  getAiImportValidationReasonCode,
  summarizeAiImportValidationErrors,
} from "./aiImportTypes";
import { buildCalendarImportResponsesRequest } from "./openAiCalendarRequest";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";
import {
  AiCalendarImportProcessingError,
  DEFAULT_OPENAI_CALENDAR_MODEL,
  OpenAiCalendarApplicationTimeoutError,
  OpenAiCalendarPdfPreparationError,
  buildAiCalendarProcessingDiagnostics,
  createOpenAiCalendarTimeoutController,
  getOpenAiCalendarConfiguration,
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

export { DEFAULT_OPENAI_CALENDAR_MODEL };

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

export async function analyzeCalendarPdf(file: File): Promise<CalendarAnalyzerResult> {
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
  const model = configuration.model;
  const timeoutMs = configuration.timeoutMs;
  const startedAt = Date.now();
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
    const timeoutController = createOpenAiCalendarTimeoutController(timeoutMs);

    try {
      logOpenAiCalendarDiagnostic("info", "openai_attempt_started", {
        model,
        stage,
        fileUploadSucceeded,
        responsesApiCallBegan,
        durationMs: Date.now() - startedAt,
      });

      stage = "uploading_file";
      const uploaded = await client.files.create(
        {
          file: uploadableFile,
          purpose: "user_data",
        },
        { signal: timeoutController.controller.signal }
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
      logOpenAiCalendarEnvironmentDiagnostic("before_responses_api_call");
      const { data: response, request_id: requestId } = await client.responses
        .create(
          buildCalendarImportResponsesRequest(model, uploaded.id),
          { signal: timeoutController.controller.signal }
        )
        .withResponse();

      stage = "reading_response";
      if (openAiResponseIncomplete(response)) {
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF but could not build a reliable calendar draft. You can try another PDF or continue manually.",
          retryable: true,
        };
      }

      if (openAiResponseHasRefusal(response)) {
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

      stage = "normalizing_response";
      let normalized: ReturnType<typeof normalizeAiCalendarExtraction>;
      try {
        normalized = normalizeAiCalendarExtraction(raw, {
          source: "openai",
          usage: {
            model,
            requestId: requestId || undefined,
            inputTokens: response.usage?.input_tokens,
            outputTokens: response.usage?.output_tokens,
            totalTokens: response.usage?.total_tokens,
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

      if (!normalized.success) {
        const reasonCode = getAiImportValidationReasonCode(normalized.validationErrors);
        const validationErrors = summarizeAiImportValidationErrors(
          normalized.validationErrors
        );
        console.warn("AI calendar import validation failed", {
          model,
          requestId,
          durationMs: Date.now() - startedAt,
          errorCount: normalized.errors.length,
          phase: "schema_validation",
          reasonCode,
          validationErrors,
        });
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF, but one part of the calendar could not be validated. Retry, or continue manually.",
          retryable: true,
          reasonCode,
        };
      }

      logOpenAiCalendarDiagnostic("info", "openai_analysis_completed", {
        model,
        requestId,
        stage: "complete",
        fileUploadSucceeded,
        responsesApiCallBegan,
        durationMs: Date.now() - startedAt,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        totalTokens: response.usage?.total_tokens,
      });

      return {
        status: "success",
        importResult: normalized.importResult,
      };
    } catch (error) {
      const handledError = timeoutController.timedOut
        ? new OpenAiCalendarApplicationTimeoutError(timeoutMs)
        : error;

      if (!timeoutController.timedOut && shouldRetryOpenAiError(error, attempt)) {
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
      timeoutController.clear();
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
