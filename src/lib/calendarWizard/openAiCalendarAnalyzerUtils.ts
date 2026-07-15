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
      reasonCode?: OpenAiCalendarConfigurationReasonCode;
    };

export type OpenAiCalendarAnalysisStage =
  | "preparing_file"
  | "uploading_file"
  | "file_uploaded"
  | "creating_response"
  | "reading_response"
  | "normalizing_response"
  | "complete";

export type OpenAiErrorDiagnosticContext = {
  model: string;
  stage: OpenAiCalendarAnalysisStage;
  fileUploadSucceeded: boolean;
  responsesApiCallBegan: boolean;
  durationMs: number;
};

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
export const DEFAULT_OPENAI_CALENDAR_MODEL = "gpt-5";
export const DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS = 180_000;
export const MIN_OPENAI_CALENDAR_TIMEOUT_MS = 30_000;
export const MAX_OPENAI_CALENDAR_TIMEOUT_MS = 300_000;

export type OpenAiCalendarConfigurationReasonCode =
  | "missing_openai_api_key"
  | "missing_model"
  | "import_mode_disabled"
  | "invalid_timeout"
  | "unsupported_model"
  | "openai_authentication_failed";

export type CalendarImportMode = "mock" | "openai" | "disabled";
type CalendarImportEnv = Record<string, string | undefined>;

type OpenAiCalendarConfiguration =
  | {
      ok: true;
      mode: "mock";
    }
  | {
      ok: true;
      mode: "openai";
      apiKey: string;
      model: string;
      timeoutMs: number;
    }
  | {
      ok: false;
      reasonCode: OpenAiCalendarConfigurationReasonCode;
      message: string;
    };

export class OpenAiCalendarApplicationTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number) {
    super("Calendar analysis aborted after configured application timeout.");
    this.name = "OpenAiCalendarApplicationTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class OpenAiCalendarPdfPreparationError extends Error {
  constructor() {
    super("Calendar PDF could not be prepared for analysis.");
    this.name = "OpenAiCalendarPdfPreparationError";
  }
}

export function parseOpenAiCalendarTimeoutMs(value: string | null | undefined) {
  if (!value?.trim()) return DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS;

  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS;
  }

  return Math.min(
    MAX_OPENAI_CALENDAR_TIMEOUT_MS,
    Math.max(MIN_OPENAI_CALENDAR_TIMEOUT_MS, parsed)
  );
}

export function getOpenAiCalendarTimeoutMs() {
  return parseOpenAiCalendarTimeoutMs(process.env.OPENAI_CALENDAR_TIMEOUT_MS);
}

export function createOpenAiCalendarTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new OpenAiCalendarApplicationTimeoutError(timeoutMs));
  }, timeoutMs);

  return {
    controller,
    clear() {
      clearTimeout(timeout);
    },
    get timedOut() {
      return timedOut;
    },
  };
}

export function getCalendarImportMode(env: CalendarImportEnv = process.env): CalendarImportMode {
  const mode = env.AI_CALENDAR_IMPORT_MODE?.trim().toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "disabled" || mode === "off" || mode === "false") return "disabled";
  return "openai";
}

export function getOpenAiCalendarConfiguration(
  env: CalendarImportEnv = process.env
): OpenAiCalendarConfiguration {
  const mode = getCalendarImportMode(env);
  if (mode === "mock") {
    return { ok: true, mode: "mock" };
  }

  if (mode === "disabled") {
    return {
      ok: false,
      reasonCode: "import_mode_disabled",
      message: "AI calendar import is disabled in this environment.",
    };
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      reasonCode: "missing_openai_api_key",
      message: "AI calendar import is not enabled in this environment. Ask an administrator to add the OpenAI API key and retry.",
    };
  }

  const model = env.OPENAI_CALENDAR_MODEL?.trim() || DEFAULT_OPENAI_CALENDAR_MODEL;
  if (!model.trim()) {
    return {
      ok: false,
      reasonCode: "missing_model",
      message: "AI calendar import is missing a model configuration.",
    };
  }

  return {
    ok: true,
    mode: "openai",
    apiKey,
    model,
    timeoutMs: parseOpenAiCalendarTimeoutMs(env.OPENAI_CALENDAR_TIMEOUT_MS),
  };
}

export function shouldRetryOpenAiError(error: unknown, attempt: number) {
  if (attempt > 0) return false;
  if (error instanceof OpenAiCalendarApplicationTimeoutError) return false;
  if (error instanceof RateLimitError) return true;
  if (error instanceof APIConnectionError || error instanceof APIConnectionTimeoutError) return true;
  if (error instanceof APIError && error.status && TRANSIENT_STATUS_CODES.has(error.status)) {
    return true;
  }
  return false;
}

export function mapOpenAiError(error: unknown): CalendarAnalyzerResult {
  if (error instanceof OpenAiCalendarPdfPreparationError) {
    return {
      status: "analysis_failed",
      message: "Sundial could not read this PDF. Please try exporting the calendar as a standard PDF or continue manually.",
      retryable: true,
    };
  }

  if (error instanceof OpenAiCalendarApplicationTimeoutError) {
    return {
      status: "analysis_failed",
      message: "Calendar analysis took longer than expected. Please try again or continue manually.",
    };
  }

  if (error instanceof AuthenticationError) {
    return {
      status: "configuration_error",
      message: "AI calendar import credentials could not be verified. Ask an administrator to check the OpenAI configuration.",
      reasonCode: "openai_authentication_failed",
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

export function buildOpenAiErrorDiagnostics(
  error: unknown,
  context: OpenAiErrorDiagnosticContext
) {
  const apiError = error instanceof APIError ? error : null;

  return {
    constructorName:
      error && typeof error === "object" && "constructor" in error
        ? (error as { constructor?: { name?: string } }).constructor?.name
        : undefined,
    message: error instanceof Error ? error.message : undefined,
    status: apiError?.status,
    code: apiError?.code,
    type: apiError?.type,
    param: apiError?.param,
    request_id: apiError?.requestID,
    requestId: apiError?.requestID,
    model: context.model,
    stage: context.stage,
    fileUploadSucceeded: context.fileUploadSucceeded,
    responsesApiCallBegan: context.responsesApiCallBegan,
    durationMs: context.durationMs,
  };
}

export function logOpenAiCalendarDiagnostic(
  level: "info" | "warn",
  event: string,
  context: OpenAiErrorDiagnosticContext & {
    requestId?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  }
) {
  const payload = {
    event,
    model: context.model,
    stage: context.stage,
    fileUploadSucceeded: context.fileUploadSucceeded,
    responsesApiCallBegan: context.responsesApiCallBegan,
    durationMs: context.durationMs,
    requestId: context.requestId || undefined,
    inputTokens: context.inputTokens,
    outputTokens: context.outputTokens,
    totalTokens: context.totalTokens,
  };

  if (level === "warn") {
    console.warn("AI calendar import diagnostic", payload);
    return;
  }

  console.info("AI calendar import diagnostic", payload);
}
