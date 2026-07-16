import type { AnalyzeCalendarPdfResult } from "./aiImportTypes";
import {
  isAiImportServerStage,
  type AiImportServerStage,
} from "./aiImportProgress";
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

export type AiImportStatusResponse =
  | { status: "pending"; stage?: AiImportServerStage; strategy?: string }
  | { status: "ready"; resultId: string; stage?: AiImportServerStage; strategy?: string }
  | { status: "failed"; reasonCode?: string; stage?: AiImportServerStage; strategy?: string }
  | { status: "expired"; reasonCode?: string; stage?: AiImportServerStage; strategy?: string };

function withOptionalAiImportStatusMetadata<T extends object>(
  value: T,
  stage?: AiImportServerStage,
  strategy?: string
): T & { stage?: AiImportServerStage; strategy?: string } {
  const next: T & { stage?: AiImportServerStage; strategy?: string } = {
    ...value,
  };
  if (stage) next.stage = stage;
  if (strategy) next.strategy = strategy;
  return next;
}

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
      "analysis_failed",
      "Sundial is still finishing the calendar analysis. You can keep this page open or return shortly.",
      true,
      "client_connection_ended"
    );
  }

  return safeResult(
    "analysis_failed",
    "Sundial is still finishing the calendar analysis. You can keep this page open or return shortly.",
    true,
    "client_connection_ended"
  );
}

export function isRecoverableAiImportInterruption(
  result: AnalyzeCalendarPdfResult
) {
  return (
    result.status !== "success" &&
    (result.reasonCode === "client_timeout" ||
      result.reasonCode === "client_connection_ended")
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
    status: "analysis_failed",
    message:
      "Sundial is still finishing the calendar analysis. You can keep this page open or return shortly.",
    retryable: true,
    reasonCode: "client_connection_ended",
  };
}

export async function calculatePdfSha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function parseAiImportStatusResponse(
  response: Pick<Response, "ok" | "status" | "text">
): Promise<AiImportStatusResponse> {
  const body = await response.text();

  try {
    const parsed = body.trim() ? (JSON.parse(body) as unknown) : null;

    if (
      parsed &&
      typeof parsed === "object" &&
      "status" in parsed &&
      typeof (parsed as { status?: unknown }).status === "string"
    ) {
      const record = parsed as {
        status: string;
        resultId?: unknown;
        reasonCode?: unknown;
        stage?: unknown;
        strategy?: unknown;
      };
      const status = record.status;
      const stage = isAiImportServerStage(record.stage) ? record.stage : undefined;
      const strategy =
        typeof record.strategy === "string" ? record.strategy : undefined;

      if (status === "pending") {
        return withOptionalAiImportStatusMetadata({ status }, stage, strategy);
      }
      if (status === "ready" && typeof record.resultId === "string") {
        return withOptionalAiImportStatusMetadata(
          { status, resultId: record.resultId },
          stage,
          strategy
        );
      }
      if (status === "failed" || status === "expired") {
        return withOptionalAiImportStatusMetadata({
          status,
          reasonCode:
            typeof record.reasonCode === "string"
              ? record.reasonCode
              : undefined,
        }, stage, strategy);
      }
    }
  } catch {
    // Treat malformed platform responses as still pending so the client can keep polling.
  }

  return response.status === 403 || response.status === 404
    ? { status: "failed", reasonCode: "permission_or_school_unavailable" }
    : { status: "pending" };
}
