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

export function formatGameDateTime(value: string | null) {
  if (!value) return "Date not set";

  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}
