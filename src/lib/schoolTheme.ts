export type SchoolThemeAppearance = "light" | "dark" | "system";

type SchoolThemeInput = {
  primary_color?: string | null;
  secondary_color?: string | null;
};

function getHexRgb(color: string) {
  const normalized = color.trim().replace(/^#/, "");
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized;

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function isLightColor(color: string) {
  const rgb = getHexRgb(color);
  if (!rgb) return false;

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.62;
}

export function isDarkColor(color: string) {
  return !isLightColor(color);
}

export function getContrastTextColor(backgroundColor: string) {
  return isLightColor(backgroundColor) ? "#07152F" : "#FFFFFF";
}

function getRelativeLuminance(color: string) {
  const rgb = getHexRgb(color);
  if (!rgb) return null;

  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function getContrastRatio(color: string, backgroundColor: string) {
  const foregroundLuminance = getRelativeLuminance(color);
  const backgroundLuminance = getRelativeLuminance(backgroundColor);

  if (foregroundLuminance === null || backgroundLuminance === null) {
    return 1;
  }

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixColors(color: string, targetColor: string, amount: number) {
  const rgb = getHexRgb(color);
  const targetRgb = getHexRgb(targetColor);

  if (!rgb || !targetRgb) return color;

  const mixChannel = (start: number, end: number) =>
    Math.round(start + (end - start) * amount)
      .toString(16)
      .padStart(2, "0");

  return `#${mixChannel(rgb.r, targetRgb.r)}${mixChannel(rgb.g, targetRgb.g)}${mixChannel(rgb.b, targetRgb.b)}`;
}

export function getVisibleAccentColor(accentColor: string, backgroundColor: string) {
  const minimumContrast = 2.4;

  if (getContrastRatio(accentColor, backgroundColor) >= minimumContrast) {
    return accentColor;
  }

  const targetColor = isLightColor(backgroundColor) ? "#07152F" : "#FFFFFF";

  for (const amount of [0.25, 0.4, 0.55, 0.7, 0.85]) {
    const adjustedColor = mixColors(accentColor, targetColor, amount);

    if (getContrastRatio(adjustedColor, backgroundColor) >= minimumContrast) {
      return adjustedColor;
    }
  }

  return targetColor;
}

export function getSchoolTheme(
  school: SchoolThemeInput,
  appearance: SchoolThemeAppearance = "light"
) {
  const schoolColor = school.primary_color || "#2563eb";
  const accentColor = school.secondary_color || schoolColor;
  const mode = appearance === "dark" ? "dark" : "light";
  const pageBackground = mode === "dark" ? "#050505" : "#F8FAFC";
  const cardBackground = mode === "dark" ? "#242424" : "#FFFFFF";

  return {
    appearance: mode,
    schoolColor,
    accentColor,
    schoolColorText: getContrastTextColor(schoolColor),
    accentColorText: getContrastTextColor(accentColor),
    pageBackground,
    cardBackground,
    visibleAccentOnPage: getVisibleAccentColor(accentColor, pageBackground),
    visibleAccentOnCard: getVisibleAccentColor(accentColor, cardBackground),
    visibleAccentOnSchoolColor: getVisibleAccentColor(accentColor, schoolColor),
  };
}
