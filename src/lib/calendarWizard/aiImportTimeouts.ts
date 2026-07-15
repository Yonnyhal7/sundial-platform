export const DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS = 180_000;
export const MIN_OPENAI_CALENDAR_TIMEOUT_MS = 30_000;
export const MAX_OPENAI_CALENDAR_TIMEOUT_MS = 300_000;
export const AI_IMPORT_CLIENT_TIMEOUT_BUFFER_MS = 30_000;
export const DEFAULT_AI_IMPORT_CLIENT_TIMEOUT_MS =
  DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS + AI_IMPORT_CLIENT_TIMEOUT_BUFFER_MS;

export function parsePositiveInteger(value: string | null | undefined) {
  if (!value?.trim()) return null;

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

export function parseOpenAiCalendarTimeoutMs(value: string | null | undefined) {
  const parsed = parsePositiveInteger(value);
  if (!parsed) return DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS;

  return Math.min(
    MAX_OPENAI_CALENDAR_TIMEOUT_MS,
    Math.max(MIN_OPENAI_CALENDAR_TIMEOUT_MS, parsed)
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
