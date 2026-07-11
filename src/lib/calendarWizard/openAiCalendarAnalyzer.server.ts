import "server-only";

import OpenAI, { toFile } from "openai";
import {
  normalizeAiCalendarExtraction,
  type RawAiCalendarExtraction,
} from "./aiCalendarImportNormalizer";
import { buildCalendarImportResponsesRequest } from "./openAiCalendarRequest";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";
import {
  OpenAiCalendarApplicationTimeoutError,
  createOpenAiCalendarTimeoutController,
  getCalendarImportMode,
  getOpenAiCalendarTimeoutMs,
  mapOpenAiError,
  openAiResponseHasRefusal,
  openAiResponseIncomplete,
  shouldRetryOpenAiError,
  buildOpenAiErrorDiagnostics,
  type OpenAiCalendarAnalysisStage,
  type CalendarAnalyzerResult,
} from "./openAiCalendarAnalyzerUtils";

export const DEFAULT_OPENAI_CALENDAR_MODEL = "gpt-5";

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getCalendarModel() {
  return process.env.OPENAI_CALENDAR_MODEL?.trim() || DEFAULT_OPENAI_CALENDAR_MODEL;
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
  if (getCalendarImportMode() === "mock") {
    return {
      status: "success",
      importResult: createMockAiCalendarImportResult(),
    };
  }

  const client = getOpenAiClient();
  if (!client) {
    return {
      status: "configuration_error",
      message: "AI calendar import is not configured yet.",
    };
  }

  const model = getCalendarModel();
  const timeoutMs = getOpenAiCalendarTimeoutMs();
  const startedAt = Date.now();
  let stage: OpenAiCalendarAnalysisStage = "preparing_file";
  let fileUploadSucceeded = false;
  let responsesApiCallBegan = false;
  const uploadableFile = await toFile(file, file.name || "calendar.pdf", {
    type: "application/pdf",
  });
  let openAiFileId: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timeoutController = createOpenAiCalendarTimeoutController(timeoutMs);

    try {
      stage = "uploading_file";
      const uploaded = await client.files.create({
        file: uploadableFile,
        purpose: "user_data",
      });
      openAiFileId = uploaded.id;
      fileUploadSucceeded = true;

      stage = "creating_response";
      responsesApiCallBegan = true;
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
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF but could not build a reliable calendar draft. You can try another PDF or continue manually.",
        };
      }

      stage = "normalizing_response";
      const normalized = normalizeAiCalendarExtraction(raw, {
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

      if (!normalized.success) {
        console.warn("AI calendar import validation failed", {
          model,
          requestId,
          durationMs: Date.now() - startedAt,
          errorCount: normalized.errors.length,
        });
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF but could not build a reliable calendar draft. You can try another PDF or continue manually.",
        };
      }

      console.info("AI calendar import completed", {
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
