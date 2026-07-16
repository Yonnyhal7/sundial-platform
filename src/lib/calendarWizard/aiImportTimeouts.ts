export const DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS = 180_000;
export const DEFAULT_OPENAI_CALENDAR_TEXT_TIMEOUT_MS = 120_000;
export const DEFAULT_OPENAI_CALENDAR_PDF_TIMEOUT_MS = 240_000;
export const MIN_OPENAI_CALENDAR_TIMEOUT_MS = 30_000;
export const MAX_OPENAI_CALENDAR_TIMEOUT_MS = 300_000;
export const AI_IMPORT_CLIENT_TIMEOUT_BUFFER_MS = 30_000;
export const DEFAULT_AI_IMPORT_CLIENT_TIMEOUT_MS =
  DEFAULT_OPENAI_CALENDAR_PDF_TIMEOUT_MS + AI_IMPORT_CLIENT_TIMEOUT_BUFFER_MS;
export const AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS = 270_000;
export const AI_IMPORT_ROUTE_RESPONSE_RESERVE_MS = 30_000;
export const AI_IMPORT_MIN_PDF_FALLBACK_BUDGET_MS = 155_000;
export const AI_IMPORT_MIN_REPAIR_BUDGET_MS = 45_000;

export function parsePositiveInteger(value: string | null | undefined) {
  if (!value?.trim()) return null;

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function parseOpenAiCalendarTimeoutMsWithDefault(
  value: string | null | undefined,
  defaultValue: number
) {
  const parsed = parsePositiveInteger(value);
  if (!parsed) return defaultValue;

  return Math.min(
    MAX_OPENAI_CALENDAR_TIMEOUT_MS,
    Math.max(MIN_OPENAI_CALENDAR_TIMEOUT_MS, parsed)
  );
}

export function parseOpenAiCalendarTimeoutMs(value: string | null | undefined) {
  return parseOpenAiCalendarTimeoutMsWithDefault(
    value,
    DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS
  );
}

export function parseOpenAiCalendarTextTimeoutMs(value: string | null | undefined) {
  return parseOpenAiCalendarTimeoutMsWithDefault(
    value,
    DEFAULT_OPENAI_CALENDAR_TEXT_TIMEOUT_MS
  );
}

export function parseOpenAiCalendarPdfTimeoutMs(value: string | null | undefined) {
  return parseOpenAiCalendarTimeoutMsWithDefault(
    value,
    DEFAULT_OPENAI_CALENDAR_PDF_TIMEOUT_MS
  );
}

export function getAiImportClientTimeoutMs(
  analyzerTimeoutMs = DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS,
  overrideValue?: string | null
) {
  const minimumClientTimeoutMs =
    analyzerTimeoutMs + AI_IMPORT_CLIENT_TIMEOUT_BUFFER_MS;
  const parsedOverride = parsePositiveInteger(overrideValue);

  return Math.max(
    DEFAULT_AI_IMPORT_CLIENT_TIMEOUT_MS,
    minimumClientTimeoutMs,
    parsedOverride || 0
  );
}

export function hasAiImportPdfFallbackBudget(
  elapsedMs: number,
  {
    routeBudgetMs = AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS,
    minimumFallbackBudgetMs = AI_IMPORT_MIN_PDF_FALLBACK_BUDGET_MS,
  }: {
    routeBudgetMs?: number;
    minimumFallbackBudgetMs?: number;
  } = {}
) {
  return elapsedMs <= routeBudgetMs - minimumFallbackBudgetMs;
}

export function hasAiImportRepairBudget(
  elapsedMs: number,
  {
    routeBudgetMs = AI_IMPORT_ROUTE_PROCESSING_DEADLINE_MS,
    responseReserveMs = AI_IMPORT_ROUTE_RESPONSE_RESERVE_MS,
    minimumRepairBudgetMs = AI_IMPORT_MIN_REPAIR_BUDGET_MS,
  }: {
    routeBudgetMs?: number;
    responseReserveMs?: number;
    minimumRepairBudgetMs?: number;
  } = {}
) {
  return elapsedMs <= routeBudgetMs - responseReserveMs - minimumRepairBudgetMs;
}
