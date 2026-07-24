const COMMON_US_TIME_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

// Used only when Intl.supportedValuesOf is unavailable. These are canonical,
// region-based identifiers (never fixed offsets or abbreviations).
export const FALLBACK_TIME_ZONES = [
  ...COMMON_US_TIME_ZONES,
  "America/Adak", "America/Argentina/Buenos_Aires", "America/Bogota",
  "America/Boise", "America/Caracas", "America/Detroit", "America/Edmonton",
  "America/Halifax", "America/Indiana/Indianapolis", "America/Juneau",
  "America/Lima", "America/Mexico_City", "America/Montevideo",
  "America/North_Dakota/Center", "America/Puerto_Rico", "America/Regina",
  "America/Santiago", "America/Sao_Paulo", "America/St_Johns",
  "America/Toronto", "America/Vancouver", "America/Winnipeg",
  "Asia/Baghdad", "Asia/Bangkok", "Asia/Colombo", "Asia/Dhaka", "Asia/Dubai",
  "Asia/Hong_Kong", "Asia/Jakarta", "Asia/Jerusalem", "Asia/Karachi",
  "Asia/Kathmandu", "Asia/Kolkata", "Asia/Manila", "Asia/Seoul",
  "Asia/Shanghai", "Asia/Singapore", "Asia/Taipei", "Asia/Tokyo",
  "Africa/Cairo", "Africa/Casablanca", "Africa/Johannesburg", "Africa/Lagos",
  "Africa/Nairobi", "Atlantic/Azores", "Atlantic/Reykjavik",
  "Australia/Adelaide", "Australia/Brisbane", "Australia/Darwin",
  "Australia/Hobart", "Australia/Melbourne", "Australia/Perth", "Australia/Sydney",
  "Europe/Amsterdam", "Europe/Athens", "Europe/Berlin", "Europe/Brussels",
  "Europe/Bucharest", "Europe/Dublin", "Europe/Helsinki", "Europe/Istanbul",
  "Europe/Lisbon", "Europe/London", "Europe/Madrid", "Europe/Moscow",
  "Europe/Paris", "Europe/Prague", "Europe/Rome", "Europe/Stockholm",
  "Europe/Vienna", "Europe/Warsaw", "Europe/Zurich", "Indian/Maldives",
  "Pacific/Auckland", "Pacific/Chatham", "Pacific/Fiji", "Pacific/Guam",
  "Pacific/Pago_Pago", "Pacific/Port_Moresby", "Pacific/Tahiti",
] as const;

export const COMMON_SCHOOL_TIME_ZONES = [...COMMON_US_TIME_ZONES];

type SupportedValuesProvider = (key: "timeZone") => string[];

function runtimeSupportedValuesOf(): SupportedValuesProvider | undefined {
  return typeof Intl.supportedValuesOf === "function"
    ? (key) => Intl.supportedValuesOf(key)
    : undefined;
}

export function getSupportedTimeZones(
  provider: SupportedValuesProvider | null | undefined = runtimeSupportedValuesOf()
) {
  let available: string[] = [];
  try {
    available = provider?.("timeZone") || [];
  } catch {
    available = [];
  }

  const canonical = new Set<string>([
    ...COMMON_US_TIME_ZONES,
    ...(available.length ? available : FALLBACK_TIME_ZONES),
  ]);
  for (const invalid of ["PST", "EST", "CST", "UTC-8", "Etc/GMT+8"]) {
    canonical.delete(invalid);
  }

  const common = COMMON_US_TIME_ZONES.filter((zone) => canonical.has(zone));
  const rest = [...canonical]
    .filter((zone) => !COMMON_US_TIME_ZONES.includes(zone as never))
    .sort((a, b) => a.localeCompare(b));
  return [...common, ...rest];
}

const SUPPORTED_TIME_ZONE_SET = new Set(getSupportedTimeZones());

export function isSupportedTimeZone(value: string) {
  return value.length <= 100 && SUPPORTED_TIME_ZONE_SET.has(value);
}

const FRIENDLY_NAMES: Record<string, string> = {
  "America/Los_Angeles": "Pacific Time — Los Angeles",
  "America/Denver": "Mountain Time — Denver",
  "America/Phoenix": "Mountain Time — Phoenix",
  "America/Chicago": "Central Time — Chicago",
  "America/New_York": "Eastern Time — New York",
  "America/Anchorage": "Alaska Time — Anchorage",
  "Pacific/Honolulu": "Hawaii Time — Honolulu",
};

function getOffsetPart(timeZone: string, date: Date) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date).find((candidate) => candidate.type === "timeZoneName")?.value;
  return part || "GMT";
}

export function getTimeZoneOffsetLabel(timeZone: string, date = new Date()) {
  const value = getOffsetPart(timeZone, date).replace(/^GMT/, "UTC");
  return value.replace("-", "−");
}

export function timeZoneObservesDst(timeZone: string, year = new Date().getUTCFullYear()) {
  return getOffsetPart(timeZone, new Date(Date.UTC(year, 0, 15, 12))) !==
    getOffsetPart(timeZone, new Date(Date.UTC(year, 6, 15, 12)));
}

export function getTimeZoneFriendlyName(timeZone: string) {
  if (FRIENDLY_NAMES[timeZone]) return FRIENDLY_NAMES[timeZone];
  const parts = timeZone.split("/");
  const location = parts.at(-1)?.replaceAll("_", " ") || timeZone;
  const region = parts.length > 1 ? parts[0].replaceAll("_", " ") : "International";
  return `${location} — ${region}`;
}

export function getTimeZoneLabel(timeZone: string, date = new Date()) {
  const noDst = timeZoneObservesDst(timeZone, date.getUTCFullYear()) ? "" : ", no DST";
  return `${getTimeZoneFriendlyName(timeZone)} (${getTimeZoneOffsetLabel(timeZone, date)}${noDst})`;
}

export type TimeZoneOption = { zone: string; label: string };

export function getTimeZoneOptions(date = new Date()): TimeZoneOption[] {
  return getSupportedTimeZones().map((zone) => ({ zone, label: getTimeZoneLabel(zone, date) }));
}

export function filterTimeZoneOptions(options: TimeZoneOption[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter(({ zone, label }) =>
    `${zone} ${label}`.toLowerCase().includes(normalized)
  );
}

export function getTimeZoneClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function formatDateTimeInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatTimestampDateInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function schoolLocalDateStartToUtc(dateKey: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const desiredWallTime = Date.UTC(year, month - 1, day, 0, 0, 0);
  let instant = desiredWallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getTimeZoneClockParts(new Date(instant), timeZone);
    const representedWallTime = Date.UTC(
      parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second
    );
    instant += desiredWallTime - representedWallTime;
  }
  return new Date(instant);
}

export function getMillisecondsUntilNextMidnight(timeZone: string, now = new Date()) {
  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  let low = now.getTime() + 1000;
  let high = now.getTime() + 36 * 60 * 60 * 1000;
  const dateAt = (milliseconds: number) => new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(milliseconds));
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2);
    if (dateAt(middle) === currentDate) low = middle + 1;
    else high = middle;
  }
  return Math.max(1000, high - now.getTime());
}
