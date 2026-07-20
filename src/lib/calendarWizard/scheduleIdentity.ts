const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2212]/g;

export const CANONICAL_DEFAULT_SCHEDULE_KEY = "sched-regular";

const DEFAULT_SCHEDULE_ALIASES = new Set([
  "regular",
  "regular-schedule",
  "default",
  "default-schedule",
  "normal",
  "normal-schedule",
  "standard",
  "standard-schedule",
  "all-periods",
  "allperiods",
]);

/** Conservative schedule identity: formatting variants collapse; semantic words remain. */
export function canonicalScheduleName(name: string) {
  return name.normalize("NFKC").toLowerCase().replace(DASHES, "-")
    .replace(/[‘’`']/g, "").replace(/\bperiod\b/g, "periods")
    .replace(/\b(?:day|schedule)\b/g, " ")
    .replace(/\s*-\s*/g, "-").replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function isDefaultScheduleAlias(value: string) {
  const canonical = canonicalScheduleName(value).replace(/^(?:ai-)?sched-/, "");
  return DEFAULT_SCHEDULE_ALIASES.has(canonical);
}

export function canonicalScheduleReference(value: string) {
  return isDefaultScheduleAlias(value) ? CANONICAL_DEFAULT_SCHEDULE_KEY : value.trim();
}

export function isRegularScheduleInferenceResolutionMessage(message: string) {
  const normalized = message.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return normalized === "sundial assigned standard instructional days to the regular schedule." ||
    normalized === "sundial assigned standard instructional days to the regular schedule";
}
