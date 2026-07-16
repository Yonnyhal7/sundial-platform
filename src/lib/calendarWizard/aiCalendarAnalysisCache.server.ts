import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  validateAiCalendarImportResult,
  type AiCalendarImportResult,
} from "./aiImportTypes";

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
const keyString = (key: CalendarAnalysisCacheKey) =>
  `${key.schoolId}:${key.pdfHash}:${key.strategy}:${key.model}:${key.version}`;

export type CalendarAnalysisCacheEntry = {
  result: AiCalendarImportResult;
  createdAt: string;
};

export async function readCalendarAnalysisCacheEntry(
  key: CalendarAnalysisCacheKey,
  options: { minCreatedAt?: number } = {}
): Promise<CalendarAnalysisCacheEntry | null> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("ai_calendar_analysis_cache")
    .select("result, created_at")
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

  if (error || !data) return null;
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
    created_at: new Date().toISOString(),
  }, { onConflict: "school_id,pdf_sha256,analysis_strategy,model,prompt_schema_version" });
  recentFailures.delete(keyString(key));
}

export async function dedupeCalendarAnalysis<T>(key: CalendarAnalysisCacheKey, analyze: () => Promise<T>): Promise<T> {
  const id = keyString(key);
  const existing = inFlight.get(id) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = analyze().finally(() => inFlight.delete(id));
  inFlight.set(id, pending);
  return pending;
}

export function hasPendingCalendarAnalysis(key: CalendarAnalysisCacheKey) {
  return inFlight.has(keyString(key));
}

export function recordCalendarAnalysisFailure(
  key: CalendarAnalysisCacheKey,
  reasonCode = "analysis_failed"
) {
  recentFailures.set(keyString(key), {
    reasonCode,
    failedAt: Date.now(),
  });
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
