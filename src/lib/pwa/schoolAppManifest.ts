import type { MetadataRoute } from "next";
import type { MobileAppSchool } from "@/lib/mobileAppData";

const DEFAULT_THEME_COLOR = "#2563EB";
const LIGHT_BACKGROUND_COLOR = "#F8FAFC";
const DARK_BACKGROUND_COLOR = "#050505";

function normalizeColor(value: string | null | undefined, fallback: string) {
  const color = value?.trim();

  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) {
    return fallback;
  }

  return color.toUpperCase();
}

export function getSchoolAppThemeColor(value: string | null | undefined) {
  return normalizeColor(value, DEFAULT_THEME_COLOR);
}

export function getSchoolAppIconUrl(value: string | null | undefined) {
  const iconUrl = value?.trim();
  if (!iconUrl) return null;

  if (iconUrl.startsWith("/") && !iconUrl.startsWith("//")) {
    return iconUrl;
  }

  try {
    const parsed = new URL(iconUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function getSchoolAppShortName(schoolName: string) {
  const normalizedName = schoolName.replace(/\s+/g, " ").trim() || "Sundial";
  const appName = `${normalizedName} App`;

  if (appName.length <= 20) return appName;
  if (normalizedName.length <= 20) return normalizedName;

  return `${normalizedName.slice(0, 17).trimEnd()}...`;
}

export function getSchoolAppName(schoolName: string) {
  const normalizedName = schoolName.replace(/\s+/g, " ").trim() || "Sundial";
  return /\bschool$/i.test(normalizedName)
    ? `${normalizedName} App`
    : `${normalizedName} School App`;
}

export function buildSchoolAppManifest(
  school: MobileAppSchool,
  appPath: string
): MetadataRoute.Manifest {
  const normalizedName = school.name.replace(/\s+/g, " ").trim() || "Sundial";
  const schoolIcon = getSchoolAppIconUrl(school.logo_url);
  const themeColor = getSchoolAppThemeColor(school.primary_color);
  const backgroundColor =
    school.default_appearance === "dark"
      ? DARK_BACKGROUND_COLOR
      : LIGHT_BACKGROUND_COLOR;
  const icons: NonNullable<MetadataRoute.Manifest["icons"]> = [];

  if (schoolIcon) {
    icons.push({ src: schoolIcon, purpose: "any" });
  }

  icons.push(
    {
      src: "/favicon.ico",
      sizes: "any",
      type: "image/x-icon",
      purpose: "any",
    },
    {
      src: "/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
      purpose: "any",
    }
  );

  return {
    id: appPath,
    name: getSchoolAppName(normalizedName),
    short_name: getSchoolAppShortName(normalizedName),
    description:
      "School schedules, announcements, events, and communication in one place.",
    start_url: appPath,
    scope: appPath,
    display: "standalone",
    orientation: "portrait",
    background_color: backgroundColor,
    theme_color: themeColor,
    icons,
    shortcuts: [
      { name: "Home", short_name: "Home", url: appPath },
      {
        name: "Schedule",
        short_name: "Schedule",
        url: `${appPath}/schedule`,
      },
      { name: "Events", short_name: "Events", url: `${appPath}/events` },
      {
        name: "Athletics",
        short_name: "Athletics",
        url: `${appPath}/athletics`,
      },
    ],
  };
}
