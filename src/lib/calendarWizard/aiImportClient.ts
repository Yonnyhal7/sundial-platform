import type { AnalyzeCalendarPdfResult } from "./aiImportTypes";
import {
  getAiImportClientTimeoutMs,
  parseOpenAiCalendarTimeoutMs,
} from "./aiImportTimeouts";

function getConfiguredAnalyzerTimeoutMs() {
  return parseOpenAiCalendarTimeoutMs(
    process.env.NEXT_PUBLIC_OPENAI_CALENDAR_TIMEOUT_MS
  );
}

export function getConfiguredAiImportClientTimeoutMs() {
  return getAiImportClientTimeoutMs(getConfiguredAnalyzerTimeoutMs());
}

export const AI_IMPORT_CLIENT_TIMEOUT_MS = getConfiguredAiImportClientTimeoutMs();
export type AnalyzeCalendarPdfFailureResult = Exclude<
  AnalyzeCalendarPdfResult,
  { status: "success" }
>;

export class AiImportClientTimeoutError extends Error {
  constructor() {
    super("AI calendar import request timed out in the browser.");
    this.name = "AiImportClientTimeoutError";
  }
}

function safeResult(
  status: AnalyzeCalendarPdfFailureResult["status"],
  message: string,
  retryable = true,
  reasonCode?: string
): AnalyzeCalendarPdfFailureResult {
  return { status, message, retryable, reasonCode };
}

function isAnalyzeCalendarPdfResult(value: unknown): value is AnalyzeCalendarPdfResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as { status?: unknown }).status === "string"
  );
}

export function createAiImportClientTimeoutController(
  timeoutMs = AI_IMPORT_CLIENT_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => {
    controller.abort(new AiImportClientTimeoutError());
  }, timeoutMs);

  return {
    controller,
    clear() {
      globalThis.clearTimeout(timeout);
    },
  };
}

export async function parseAiImportResponse(
  response: Pick<Response, "ok" | "status" | "text">
): Promise<AnalyzeCalendarPdfResult> {
  const body = await response.text();
  let parsed: unknown = null;

  if (body.trim()) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
  }

  if (isAnalyzeCalendarPdfResult(parsed)) {
    return parsed;
  }

  if (response.status === 408 || response.status === 504) {
    return safeResult(
      "analysis_failed",
      "Calendar analysis took longer than expected. Please try again or continue manually.",
      true,
      "client_timeout"
    );
  }

  if (response.status === 401 || response.status === 403) {
    return safeResult(
      "permission_error",
      "You do not have permission to import this calendar.",
      false
    );
  }

  if (!response.ok) {
    return safeResult(
      "server_error",
      "Sundial could not analyze this PDF yet. Please continue manually."
    );
  }

  return safeResult(
    "server_error",
    "Sundial could not read the analysis response. Please try again."
  );
}

function isAbortLikeError(error: unknown) {
  return (
    error instanceof AiImportClientTimeoutError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      ((error as { name?: unknown }).name === "AbortError" ||
        (error as { name?: unknown }).name === "TimeoutError"))
  );
}

export function mapAiImportClientError(error: unknown): AnalyzeCalendarPdfFailureResult {
  if (isAbortLikeError(error)) {
    return {
      status: "analysis_failed",
      message:
        "Calendar analysis is still taking longer than this browser request can safely wait. Please retry, or continue manually.",
      retryable: true,
      reasonCode: "client_timeout",
    };
  }

  return {
    status: "server_error",
    message: "Sundial could not analyze this PDF yet. Please continue manually.",
    retryable: true,
  };
}
