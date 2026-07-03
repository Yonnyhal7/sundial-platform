export const SPORT_ICON_OPTIONS = [
  "football",
  "baseball",
  "softball",
  "basketball",
  "soccer",
  "volleyball",
  "golf",
  "tennis",
  "track",
  "cross_country",
  "swimming",
  "wrestling",
  "cheer",
  "generic",
] as const;

export const TEAM_LEVEL_OPTIONS = [
  "Varsity",
  "JV",
  "Frosh",
  "Freshman",
  "Sophomore",
] as const;

export const TEAM_GENDER_OPTIONS = ["Boys", "Girls", "Coed"] as const;

export const DEFAULT_SPORT_ICON_COLOR = "#2563eb";

const SPORT_ICON_LABELS: Record<string, string> = {
  football: "FB",
  baseball: "BB",
  softball: "SB",
  basketball: "BK",
  soccer: "SC",
  volleyball: "VB",
  golf: "GF",
  tennis: "TN",
  track: "TR",
  cross_country: "XC",
  swimming: "SW",
  wrestling: "WR",
  cheer: "CH",
  generic: "AT",
};

export function formatSportIconName(icon: string | null | undefined) {
  if (!icon) return "Generic";
  return icon
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function getSportIconLabel(icon: string | null | undefined) {
  return SPORT_ICON_LABELS[icon || "generic"] || SPORT_ICON_LABELS.generic;
}

export function normalizeSportIconColor(color: string | null | undefined) {
  const trimmed = (color || "").trim();

  return /^#[0-9a-fA-F]{6}$/.test(trimmed)
    ? trimmed
    : DEFAULT_SPORT_ICON_COLOR;
}

export function buildTeamDisplayName({
  level,
  gender,
  sportName,
}: {
  level: string;
  gender: string;
  sportName: string;
}) {
  return [level, gender === "Coed" ? "" : gender, sportName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function parseGameDateTimeParts(value: string | null) {
  if (!value) return null;

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/
  );

  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] ? Number(match[4]) : null,
    minute: match[5] ? Number(match[5]) : 0,
  };
}

function formatGameTimeParts(hour: number, minute: number) {
  const hour12 = hour % 12 || 12;
  const period = hour >= 12 ? "PM" : "AM";

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatGameDateTime(value: string | null) {
  if (!value) return "Date not set";

  const parts = parseGameDateTimeParts(value);

  if (!parts) return value;

  const date = new Date(parts.year, parts.month - 1, parts.day);

  if (Number.isNaN(date.getTime())) return value;

  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (parts.hour === null) return dateLabel;

  return `${dateLabel}, ${formatGameTimeParts(parts.hour, parts.minute)}`;
}

export function formatGameTime(value: string | null) {
  const parts = parseGameDateTimeParts(value);

  if (!parts || parts.hour === null) return "Time TBA";

  return formatGameTimeParts(parts.hour, parts.minute);
}

export function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";

  const match = value.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);

  return match ? `${match[1]}T${match[2]}` : "";
}
