import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateAiCalendarImportResult, type AiCalendarImportResult } from "./aiImportTypes";

export const AI_CALENDAR_PROMPT_SCHEMA_VERSION = "calendar-v2";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CalendarAnalysisCacheKey = {
  schoolId: string;
  pdfHash: string;
  model: string;
  version: string;
};

const inFlight = new Map<string, Promise<unknown>>();
const keyString = (key: CalendarAnalysisCacheKey) =>
  `${key.schoolId}:${key.pdfHash}:${key.model}:${key.version}`;

export async function readCalendarAnalysisCache(key: CalendarAnalysisCacheKey) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_calendar_analysis_cache")
    .select("result, created_at")
    .eq("school_id", key.schoolId)
    .eq("pdf_sha256", key.pdfHash)
    .eq("model", key.model)
    .eq("prompt_schema_version", key.version)
    .gte("created_at", new Date(Date.now() - CACHE_TTL_MS).toISOString())
    .maybeSingle();
  if (error || !data) return null;
  const validation = validateAiCalendarImportResult(data.result);
  return validation.success ? validation.data : null;
}

export async function writeCalendarAnalysisCache(key: CalendarAnalysisCacheKey, result: AiCalendarImportResult) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("ai_calendar_analysis_cache").upsert({
    school_id: key.schoolId,
    pdf_sha256: key.pdfHash,
    model: key.model,
    prompt_schema_version: key.version,
    result,
    created_at: new Date().toISOString(),
  }, { onConflict: "school_id,pdf_sha256,model,prompt_schema_version" });
}

export async function dedupeCalendarAnalysis<T>(key: CalendarAnalysisCacheKey, analyze: () => Promise<T>): Promise<T> {
  const id = keyString(key);
  const existing = inFlight.get(id) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = analyze().finally(() => inFlight.delete(id));
  inFlight.set(id, pending);
  return pending;
}
