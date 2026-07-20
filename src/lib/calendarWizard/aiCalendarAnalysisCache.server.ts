import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  validateAiCalendarImportResult,
  type AiCalendarImportResult,
} from "./aiImportTypes";
import {
  isAiImportServerStage,
  type AiImportServerStage,
} from "./aiImportProgress";
import { getOpenAiCalendarTimeoutMs } from "./openAiCalendarAnalyzerUtils";
import { AI_CALENDAR_ANALYSIS_VERSION } from "./aiCalendarAnalysisVersion";

export const AI_CALENDAR_PROMPT_SCHEMA_VERSION = AI_CALENDAR_ANALYSIS_VERSION;
export const AI_CALENDAR_TEXT_STRATEGY = "text-gpt5-mini";
export const AI_CALENDAR_PDF_STRATEGY = "pdf-gpt5";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 15 * 60 * 1000;
export const AI_CALENDAR_STALE_HEARTBEAT_MS = 45_000;
export const AI_CALENDAR_STALE_DEADLINE_GRACE_MS = 15_000;

export type CalendarAnalysisCacheKey = {
  schoolId: string;
  pdfHash: string;
  strategy: string;
  model: string;
  version: string;
};

const inFlight = new Map<string, Promise<unknown>>();
const recentFailures = new Map<
  string,
  { reasonCode: string; failedAt: number }
>();
const currentStages = new Map<
  string,
  CalendarAnalysisStageSnapshot
>();
const keyString = (key: CalendarAnalysisCacheKey) =>
  `${key.schoolId}:${key.pdfHash}:${key.strategy}:${key.model}:${key.version}`;
const attemptKey = (key: CalendarAnalysisCacheKey, analysisAttemptId?: string) =>
  `${keyString(key)}:${analysisAttemptId || "legacy"}`;

function safePostgrestDiagnostic(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as {
          code?: unknown;
          message?: unknown;
          details?: unknown;
          hint?: unknown;
        })
      : {};
  const message = typeof record.message === "string" ? record.message : undefined;
  const missingColumn = message?.match(/'([^']+)' column/)?.[1];

  return {
    reasonCode: typeof record.code === "string" ? record.code : undefined,
    message,
    details: typeof record.details === "string" ? record.details : undefined,
    hint: typeof record.hint === "string" ? record.hint : undefined,
    missingColumn,
  };
}

export type CalendarAnalysisCacheEntry = {
  result: AiCalendarImportResult;
  createdAt: string;
  strategy: string;
  model: string;
  version: string;
};

export type CalendarAnalysisStageSnapshot = {
  stage: AiImportServerStage;
  status: "pending" | "ready" | "failed";
  strategy?: string;
  requestId?: string;
  analysisAttemptId?: string;
  reasonCode?: string;
  createdAt?: number;
  updatedAt: number;
  lastHeartbeatAt?: number;
};

export async function readCalendarAnalysisCacheEntry(
  key: CalendarAnalysisCacheKey,
  options: { minCreatedAt?: number; analysisAttemptId?: string } = {}
): Promise<CalendarAnalysisCacheEntry | null> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("ai_calendar_analysis_cache")
    .select("result, created_at, status")
    .eq("school_id", key.schoolId)
    .eq("pdf_sha256", key.pdfHash)
    .eq("analysis_strategy", key.strategy)
    .eq("model", key.model)
    .eq("prompt_schema_version", key.version)
    .eq("analysis_version", key.version)
    .is("invalidated_at", null)
    .gte("created_at", new Date(Date.now() - CACHE_TTL_MS).toISOString());

  if (options.minCreatedAt) {
    query = query.gte("created_at", new Date(options.minCreatedAt).toISOString());
  }
  if (options.analysisAttemptId) query = query.eq("analysis_attempt_id", options.analysisAttemptId);

  const { data, error } = await query.maybeSingle();

  if (error || !data || data.status !== "ready" || !data.result) return null;
  const validation = validateAiCalendarImportResult(data.result);
  return validation.success
    ? {
        result: validation.data,
        createdAt: data.created_at,
        strategy: key.strategy,
        model: key.model,
        version: key.version,
      }
    : null;
}

export async function readCalendarAnalysisCache(
  key: CalendarAnalysisCacheKey,
  options: { minCreatedAt?: number } = {}
) {
  const entry = await readCalendarAnalysisCacheEntry(key, options);
  return entry?.result || null;
}

export async function writeCalendarAnalysisCache(
  key: CalendarAnalysisCacheKey,
  result: AiCalendarImportResult,
  analysisAttemptId: string
) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("ai_calendar_analysis_cache").update({
    result,
    status: "ready",
    current_stage: "ready",
    stage_strategy: key.strategy,
    reason_code: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_heartbeat_at: null,
    finished_at: new Date().toISOString(),
    invalidated_at: null,
    invalidated_by: null,
    invalidation_reason: null,
  }).eq("school_id", key.schoolId).eq("pdf_sha256", key.pdfHash)
    .eq("analysis_strategy", key.strategy).eq("model", key.model)
    .eq("prompt_schema_version", key.version).eq("analysis_version", key.version)
    .eq("analysis_attempt_id", analysisAttemptId).is("invalidated_at", null)
    .select("analysis_attempt_id").maybeSingle();
  if (!data) {
    console.warn("AI calendar import diagnostic", {
      event: "attempt_update_rejected", analysisAttemptId, currentStage: "ready",
    });
    return false;
  }
  recentFailures.delete(keyString(key));
  return true;
}

export async function claimCalendarAnalysisAttempt(
  key: CalendarAnalysisCacheKey,
  analysisAttemptId: string,
  routeRequestId: string,
  attemptStartedAt: number
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_ai_calendar_analysis_attempt", {
    p_school_id: key.schoolId, p_pdf_sha256: key.pdfHash,
    p_analysis_strategy: key.strategy, p_model: key.model, p_version: key.version,
    p_analysis_attempt_id: analysisAttemptId, p_route_request_id: routeRequestId,
    p_attempt_started_at: new Date(attemptStartedAt).toISOString(),
  });
  if (error) throw error;
  return data === true;
}

export async function invalidateCalendarAnalysisCache(
  keys: CalendarAnalysisCacheKey[],
  reason: string
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const invalidatedAt = new Date().toISOString();

  await Promise.all(
    keys.map(async (key) => {
      const { error } = await supabase
        .from("ai_calendar_analysis_cache")
        .update({
          invalidated_at: invalidatedAt,
          invalidated_by: user?.id || null,
          invalidation_reason: reason,
          status: "failed",
          current_stage: "confirmed_failed",
          reason_code: reason,
          updated_at: invalidatedAt,
          finished_at: invalidatedAt,
        })
        .eq("school_id", key.schoolId)
        .eq("pdf_sha256", key.pdfHash)
        .eq("analysis_strategy", key.strategy)
        .eq("model", key.model)
        .eq("prompt_schema_version", key.version)
        .eq("analysis_version", key.version)
        .is("invalidated_at", null);

      if (error) {
        console.warn("AI calendar import diagnostic", {
          event: "cache_invalidation_failed",
          strategy: key.strategy,
          reasonCode: error.code,
        });
        return;
      }

      recentFailures.delete(keyString(key));
      currentStages.delete(keyString(key));
    })
  );
}

export async function dedupeCalendarAnalysis<T>(key: CalendarAnalysisCacheKey, analyze: () => Promise<T>): Promise<T> {
  const id = keyString(key);
  const existing = inFlight.get(id) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = analyze().finally(() => {
    inFlight.delete(id);
    currentStages.delete(id);
  });
  inFlight.set(id, pending);
  return pending;
}

export function hasPendingCalendarAnalysis(key: CalendarAnalysisCacheKey) {
  return inFlight.has(keyString(key));
}

export async function recordCalendarAnalysisFailure(
  key: CalendarAnalysisCacheKey,
  reasonCode = "analysis_failed",
  analysisAttemptId?: string
) {
  recentFailures.set(attemptKey(key, analysisAttemptId), {
    reasonCode,
    failedAt: Date.now(),
  });
  await setCalendarAnalysisStage(key, "confirmed_failed", { reasonCode, analysisAttemptId });
}

export function getCalendarAnalysisFailure(key: CalendarAnalysisCacheKey, analysisAttemptId?: string) {
  const id = attemptKey(key, analysisAttemptId);
  const failure = recentFailures.get(id);

  if (!failure) return null;

  if (Date.now() - failure.failedAt > FAILURE_TTL_MS) {
    recentFailures.delete(id);
    return null;
  }

  return failure;
}

export async function setCalendarAnalysisStage(
  key: CalendarAnalysisCacheKey,
  stage: AiImportServerStage,
  context: { routeRequestId?: string; analysisAttemptId?: string; strategy?: string; reasonCode?: string; elapsedMs?: number } = {}
) {
  const id = attemptKey(key, context.analysisAttemptId);
  const previousSnapshot = currentStages.get(id);
  const previousStage = previousSnapshot?.stage;
  const isHeartbeat = previousStage === stage && stage !== "ready" && stage !== "confirmed_failed";
  const status =
    stage === "ready" ? "ready" : stage === "confirmed_failed" ? "failed" : "pending";
  const finishedAt = status === "pending" ? null : new Date().toISOString();
  const nowMs = Date.now();

  currentStages.set(id, {
    stage,
    status,
    strategy: context.strategy || key.strategy,
    requestId: context.routeRequestId,
    analysisAttemptId: context.analysisAttemptId,
    reasonCode: context.reasonCode,
    createdAt: previousSnapshot?.createdAt || nowMs,
    updatedAt: nowMs,
    lastHeartbeatAt: status === "pending" ? nowMs : undefined,
  });
  if (status === "pending") {
    recentFailures.delete(id);
  }

  console.info("AI calendar import diagnostic", {
    event: isHeartbeat ? "heartbeat_updated" : "stage_changed",
    previousStage,
    currentStage: stage,
    strategy: context.strategy || key.strategy,
    elapsedMs: context.elapsedMs,
    routeRequestId: context.routeRequestId,
    analysisAttemptId: context.analysisAttemptId,
    cacheKey: `${key.schoolId}:${key.pdfHash}:${key.strategy}:${key.version}`,
  });

  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const stagePatch = {
    status,
    current_stage: stage,
    stage_strategy: context.strategy || key.strategy,
    request_id: context.routeRequestId,
    reason_code: context.reasonCode || null,
    updated_at: now,
    last_heartbeat_at: status === "pending" ? now : null,
    finished_at: finishedAt,
  };
  const { data: updated, error } = await supabase
    .from("ai_calendar_analysis_cache")
    .update(stagePatch)
    .eq("school_id", key.schoolId)
    .eq("pdf_sha256", key.pdfHash)
    .eq("analysis_strategy", key.strategy)
    .eq("model", key.model)
    .eq("prompt_schema_version", key.version)
    .eq("analysis_version", key.version)
    .is("invalidated_at", null)
    .eq("analysis_attempt_id", context.analysisAttemptId || "")
    .select("school_id")
    .maybeSingle();

  if (!error && !updated) {
    console.warn("AI calendar import diagnostic", {
      event: "attempt_update_rejected",
      currentStage: stage,
      strategy: context.strategy || key.strategy,
      routeRequestId: context.routeRequestId,
      analysisAttemptId: context.analysisAttemptId,
      cacheKey: `${key.schoolId}:${key.pdfHash}:${key.strategy}:${key.version}`,
    });
    return;
  }

  if (error) {
    const diagnostic = safePostgrestDiagnostic(error);
    console.warn("AI calendar import diagnostic", {
      event: "stage_persist_failed",
      operation: "update_stage",
      currentStage: stage,
      strategy: context.strategy || key.strategy,
      routeRequestId: context.routeRequestId,
      analysisAttemptId: context.analysisAttemptId,
      cacheKey: `${key.schoolId}:${key.pdfHash}:${key.strategy}:${key.version}`,
      ...diagnostic,
    });
  }
}

export function getCalendarAnalysisStage(key: CalendarAnalysisCacheKey, analysisAttemptId?: string) {
  return currentStages.get(attemptKey(key, analysisAttemptId)) || null;
}

export async function readCalendarAnalysisStage(
  key: CalendarAnalysisCacheKey,
  options: { minUpdatedAt?: number; analysisAttemptId?: string } = {}
): Promise<CalendarAnalysisStageSnapshot | null> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("ai_calendar_analysis_cache")
    .select("status, current_stage, stage_strategy, request_id, analysis_attempt_id, reason_code, created_at, updated_at, last_heartbeat_at")
    .eq("school_id", key.schoolId)
    .eq("pdf_sha256", key.pdfHash)
    .eq("analysis_strategy", key.strategy)
    .eq("model", key.model)
    .eq("prompt_schema_version", key.version)
    .eq("analysis_version", key.version)
    .is("invalidated_at", null)
    .gte("updated_at", new Date(Date.now() - FAILURE_TTL_MS).toISOString());

  if (options.minUpdatedAt) {
    query = query.gte("updated_at", new Date(options.minUpdatedAt).toISOString());
  }
  if (options.analysisAttemptId) query = query.eq("analysis_attempt_id", options.analysisAttemptId);

  const { data, error } = await query.maybeSingle();
  if (
    error ||
    !data ||
    !isAiImportServerStage(data.current_stage) ||
    (data.status !== "pending" && data.status !== "ready" && data.status !== "failed")
  ) {
    return null;
  }

  return {
    stage: data.current_stage,
    status: data.status,
    strategy: data.stage_strategy || key.strategy,
    requestId: data.request_id || undefined,
    analysisAttemptId: data.analysis_attempt_id || undefined,
    reasonCode: data.reason_code || undefined,
    createdAt: data.created_at ? new Date(data.created_at).getTime() : undefined,
    updatedAt: new Date(data.updated_at).getTime(),
    lastHeartbeatAt: data.last_heartbeat_at
      ? new Date(data.last_heartbeat_at).getTime()
      : undefined,
  };
}

export async function markStaleCalendarAnalysisIfNeeded(
  key: CalendarAnalysisCacheKey,
  options: {
    analysisAttemptId?: string;
    analyzerDeadlineMs?: number;
    heartbeatStaleMs?: number;
    deadlineGraceMs?: number;
  } = {}
): Promise<CalendarAnalysisStageSnapshot | null> {
  const supabase = await createSupabaseServerClient();
  const analyzerDeadlineMs = options.analyzerDeadlineMs ?? getOpenAiCalendarTimeoutMs();
  const heartbeatStaleMs = options.heartbeatStaleMs ?? AI_CALENDAR_STALE_HEARTBEAT_MS;
  const deadlineGraceMs = options.deadlineGraceMs ?? AI_CALENDAR_STALE_DEADLINE_GRACE_MS;
  const { data: current, error: readError } = await supabase
    .from("ai_calendar_analysis_cache")
    .select("status, current_stage, stage_strategy, request_id, analysis_attempt_id, reason_code, updated_at, created_at, last_heartbeat_at")
    .eq("school_id", key.schoolId)
    .eq("pdf_sha256", key.pdfHash)
    .eq("analysis_strategy", key.strategy)
    .eq("model", key.model)
    .eq("prompt_schema_version", key.version)
    .eq("analysis_version", key.version)
    .is("invalidated_at", null)
    .eq("status", "pending")
    .eq("analysis_attempt_id", options.analysisAttemptId || "")
    .maybeSingle();

  if (
    readError ||
    !current ||
    !isAiImportServerStage(current.current_stage) ||
    current.status !== "pending"
  ) {
    return null;
  }

  const nowMs = Date.now();
  const heartbeatAt = new Date(
    current.last_heartbeat_at || current.updated_at
  ).getTime();
  const createdAt = new Date(current.created_at || current.updated_at).getTime();
  const heartbeatIsStale = nowMs - heartbeatAt >= heartbeatStaleMs;
  const deadlineExpired = nowMs - createdAt >= analyzerDeadlineMs + deadlineGraceMs;

  if (!heartbeatIsStale || !deadlineExpired) {
    return null;
  }

  const { data, error } = await supabase
    .from("ai_calendar_analysis_cache")
    .update({
      status: "failed",
      current_stage: "confirmed_failed",
      reason_code: "analysis_job_stale",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("school_id", key.schoolId)
    .eq("pdf_sha256", key.pdfHash)
    .eq("analysis_strategy", key.strategy)
    .eq("model", key.model)
    .eq("prompt_schema_version", key.version)
    .eq("analysis_version", key.version)
    .is("invalidated_at", null)
    .eq("status", "pending")
    .eq("analysis_attempt_id", options.analysisAttemptId || "")
    .select("status, current_stage, stage_strategy, request_id, analysis_attempt_id, reason_code, created_at, updated_at, last_heartbeat_at")
    .maybeSingle();

  if (error || !data || !isAiImportServerStage(data.current_stage)) {
    return null;
  }

  recentFailures.set(attemptKey(key, options.analysisAttemptId), {
    reasonCode: data.reason_code || "analysis_job_stale",
    failedAt: Date.now(),
  });

  console.warn("AI calendar import diagnostic", {
    event: "stale_job_detected",
    currentStage: data.current_stage,
    strategy: data.stage_strategy || key.strategy,
    requestId: data.request_id || undefined,
    analysisAttemptId: data.analysis_attempt_id || undefined,
    reasonCode: data.reason_code || "analysis_job_stale",
    heartbeatAgeMs: nowMs - heartbeatAt,
    totalAgeMs: nowMs - createdAt,
    analyzerDeadlineMs,
  });

  return {
    stage: data.current_stage,
    status: "failed",
    strategy: data.stage_strategy || key.strategy,
    requestId: data.request_id || undefined,
    reasonCode: data.reason_code || "analysis_job_stale",
    createdAt: data.created_at ? new Date(data.created_at).getTime() : undefined,
    updatedAt: new Date(data.updated_at).getTime(),
    lastHeartbeatAt: data.last_heartbeat_at
      ? new Date(data.last_heartbeat_at).getTime()
      : undefined,
  };
}
