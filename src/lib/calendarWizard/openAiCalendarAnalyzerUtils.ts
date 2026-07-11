import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  RateLimitError,
} from "openai";
import type { AiCalendarImportResult } from "./aiImportTypes";

export type CalendarAnalyzerResult =
  | { status: "success"; importResult: AiCalendarImportResult }
  | {
      status:
        | "configuration_error"
        | "rate_limited"
        | "analysis_failed"
        | "server_error";
      message: string;
      retryable?: boolean;
    };

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export function getCalendarImportMode() {
  const mode = process.env.AI_CALENDAR_IMPORT_MODE?.trim().toLowerCase();
  return mode === "mock" ? "mock" : "openai";
}

export function shouldRetryOpenAiError(error: unknown, attempt: number) {
  if (attempt > 0) return false;
  if (error instanceof RateLimitError) return true;
  if (error instanceof APIConnectionError || error instanceof APIConnectionTimeoutError) return true;
  if (error instanceof APIError && error.status && TRANSIENT_STATUS_CODES.has(error.status)) {
    return true;
  }
  return false;
}

export function mapOpenAiError(error: unknown): CalendarAnalyzerResult {
  if (error instanceof AuthenticationError) {
    return {
      status: "configuration_error",
      message: "AI calendar import could not connect to the analysis service.",
    };
  }

  if (error instanceof RateLimitError) {
    return {
      status: "rate_limited",
      message: "AI calendar import is busy right now. Please try again shortly.",
      retryable: true,
    };
  }

  if (error instanceof APIConnectionTimeoutError || isAbortError(error)) {
    return {
      status: "analysis_failed",
      message: "Calendar analysis took too long. Please try again.",
      retryable: true,
    };
  }

  if (error instanceof APIError && error.status === 413) {
    return {
      status: "analysis_failed",
      message: "This PDF is too large for the analysis service. Try a smaller calendar PDF.",
    };
  }

  if (error instanceof APIError && error.status && TRANSIENT_STATUS_CODES.has(error.status)) {
    return {
      status: "analysis_failed",
      message: "AI calendar import is temporarily unavailable. Please try again shortly.",
      retryable: true,
    };
  }

  return {
    status: "server_error",
    message: "Sundial could not analyze this PDF yet. Please continue manually.",
  };
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError")
  );
}

export function openAiResponseIncomplete(response: { status?: string | null }) {
  return response.status && response.status !== "completed";
}

export function openAiResponseHasRefusal(response: {
  output?: Array<unknown>;
}) {
  return Boolean(
    response.output?.some((item) => {
      if (typeof item !== "object" || item === null || !("content" in item)) {
        return false;
      }
      const content = (item as { content?: unknown }).content;
      return (
        Array.isArray(content) &&
        content.some(
          (part) =>
            typeof part === "object" &&
            part !== null &&
            "type" in part &&
            (part as { type?: unknown }).type === "refusal"
        )
      );
    })
  );
}
