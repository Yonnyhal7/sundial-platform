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

export const AI_CALENDAR_PROMPT_SCHEMA_VERSION = "calendar-v2";
export const AI_CALENDAR_TEXT_STRATEGY = "text-gpt5-mini";
export const AI_CALENDAR_PDF_STRATEGY = "pdf-gpt5";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 15 * 60 * 1000;

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

export type CalendarAnalysisCacheEntry = {
  result: AiCalendarImportResult;
  createdAt: string;
};

export type CalendarAnalysisStageSnapshot = {
  stage: AiImportServerStage;
  status: "pending" | "ready" | "failed";
  strategy?: string;
  requestId?: string;
  reasonCode?: string;
  updatedAt: number;
};

export async function readCalendarAnalysisCacheEntry(
  key: CalendarAnalysisCacheKey,
  options: { minCreatedAt?: number } = {}
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
    .gte("created_at", new Date(Date.now() - CACHE_TTL_MS).toISOString());

  if (options.minCreatedAt) {
    query = query.gte("created_at", new Date(options.minCreatedAt).toISOString());
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data || data.status !== "ready" || !data.result) return null;
  const validation = validateAiCalendarImportResult(data.result);
  return validation.success
    ? { result: validation.data, createdAt: data.created_at }
    : null;
}

export async function readCalendarAnalysisCache(
  key: CalendarAnalysisCacheKey,
  options: { minCreatedAt?: number } = {}
) {
  const entry = await readCalendarAnalysisCacheEntry(key, options);
  return entry?.result || null;
}

export async function writeCalendarAnalysisCache(key: CalendarAnalysisCacheKey, result: AiCalendarImportResult) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("ai_calendar_analysis_cache").upsert({
    school_id: key.schoolId,
    pdf_sha256: key.pdfHash,
    analysis_strategy: key.strategy,
    model: key.model,
    prompt_schema_version: key.version,
    result,
    status: "ready",
    current_stage: "ready",
    stage_strategy: key.strategy,
    reason_code: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "school_id,pdf_sha256,analysis_strategy,model,prompt_schema_version" });
  recentFailures.delete(keyString(key));
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
  reasonCode = "analysis_failed"
) {
  recentFailures.set(keyString(key), {
    reasonCode,
    failedAt: Date.now(),
  });
  await setCalendarAnalysisStage(key, "confirmed_failed", { reasonCode });
}

export function getCalendarAnalysisFailure(key: CalendarAnalysisCacheKey) {
  const id = keyString(key);
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
  context: { requestId?: string; strategy?: string; reasonCode?: string; elapsedMs?: number } = {}
) {
  const id = keyString(key);
  const previousStage = currentStages.get(id)?.stage;
  const status =
    stage === "ready" ? "ready" : stage === "confirmed_failed" ? "failed" : "pending";

  currentStages.set(id, {
    stage,
    status,
    strategy: context.strategy || key.strategy,
    requestId: context.requestId,
    reasonCode: context.reasonCode,
    updatedAt: Date.now(),
  });

  console.info("AI calendar import diagnostic", {
    event: "stage_changed",
    previousStage,
    currentStage: stage,
    strategy: context.strategy || key.strategy,
    elapsedMs: context.elapsedMs,
    requestId: context.requestId,
    cacheKey: `${key.schoolId}:${key.pdfHash}:${key.strategy}:${key.version}`,
  });

  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("ai_calendar_analysis_cache").upsert(
    {
      school_id: key.schoolId,
      pdf_sha256: key.pdfHash,
      analysis_strategy: key.strategy,
      model: key.model,
      prompt_schema_version: key.version,
      status,
      current_stage: stage,
      stage_strategy: context.strategy || key.strategy,
      request_id: context.requestId,
      reason_code: context.reasonCode || null,
      created_at: now,
      updated_at: now,
    },
    { onConflict: "school_id,pdf_sha256,analysis_strategy,model,prompt_schema_version" }
  );

  if (error) {
    console.warn("AI calendar import diagnostic", {
      event: "stage_persist_failed",
      currentStage: stage,
      strategy: context.strategy || key.strategy,
      requestId: context.requestId,
      cacheKey: `${key.schoolId}:${key.pdfHash}:${key.strategy}:${key.version}`,
      reasonCode: error.code,
    });
  }
}

export function getCalendarAnalysisStage(key: CalendarAnalysisCacheKey) {
  return currentStages.get(keyString(key)) || null;
}

export async function readCalendarAnalysisStage(
  key: CalendarAnalysisCacheKey,
  options: { minUpdatedAt?: number } = {}
): Promise<CalendarAnalysisStageSnapshot | null> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("ai_calendar_analysis_cache")
    .select("status, current_stage, stage_strategy, request_id, reason_code, updated_at")
    .eq("school_id", key.schoolId)
    .eq("pdf_sha256", key.pdfHash)
    .eq("analysis_strategy", key.strategy)
    .eq("model", key.model)
    .eq("prompt_schema_version", key.version)
    .gte("updated_at", new Date(Date.now() - FAILURE_TTL_MS).toISOString());

  if (options.minUpdatedAt) {
    query = query.gte("updated_at", new Date(options.minUpdatedAt).toISOString());
  }

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
    reasonCode: data.reason_code || undefined,
    updatedAt: new Date(data.updated_at).getTime(),
  };
}
