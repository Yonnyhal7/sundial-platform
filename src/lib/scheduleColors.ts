export const DEFAULT_SCHEDULE_COLOR = "#64748B";

export const SCHEDULE_COLOR_PRESETS = [
  { name: "Brown", value: "#92400E" },
  { name: "Gold", value: "#D4A017" },
  { name: "Blue", value: "#2563EB" },
  { name: "Green", value: "#16A34A" },
  { name: "Purple", value: "#7C3AED" },
  { name: "Red", value: "#DC2626" },
  { name: "Orange", value: "#EA580C" },
  { name: "Teal", value: "#0D9488" },
  { name: "Gray", value: DEFAULT_SCHEDULE_COLOR },
] as const;

export type ScheduleColorSource = {
  id?: string | null;
  name?: string | null;
  schedule_name?: string | null;
  calendar_color?: string | null;
  calendarColor?: string | null;
  color?: string | null;
};

const hexColorPattern = /^#[0-9A-F]{6}$/;

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  const normalized = withHash.toUpperCase();

  return hexColorPattern.test(normalized) ? normalized : null;
}

export function isValidHexColor(value: unknown) {
  return normalizeHexColor(value) !== null;
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function getGeneratedScheduleColor(seed: string | null | undefined) {
  const key = seed?.trim() || "schedule";
  return SCHEDULE_COLOR_PRESETS[hashString(key) % SCHEDULE_COLOR_PRESETS.length].value;
}

export function getAiScheduleDefaultColor(index: number) {
  return SCHEDULE_COLOR_PRESETS[index % SCHEDULE_COLOR_PRESETS.length].value;
}

export function getScheduleCalendarColor(
  schedule: ScheduleColorSource | null | undefined,
  fallbackSeed?: string | null
) {
  const explicit =
    normalizeHexColor(schedule?.calendar_color) ||
    normalizeHexColor(schedule?.calendarColor) ||
    normalizeHexColor(schedule?.color);

  if (explicit) return explicit;

  return getGeneratedScheduleColor(
    schedule?.id ||
      schedule?.schedule_name ||
      schedule?.name ||
      fallbackSeed ||
      "schedule"
  );
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex) || DEFAULT_SCHEDULE_COLOR;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function getScheduleColorBorder(color: string) {
  const { r, g, b } = hexToRgb(color);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  if (luminance > 0.72) return "#475569";
  if (luminance < 0.22) return "#E2E8F0";
  return "rgba(15, 23, 42, 0.28)";
}

export function getScheduleDotStyle(color: string) {
  const normalized = normalizeHexColor(color) || DEFAULT_SCHEDULE_COLOR;

  return {
    backgroundColor: normalized,
    borderColor: getScheduleColorBorder(normalized),
  };
}
