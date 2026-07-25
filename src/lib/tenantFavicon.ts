import type { Metadata } from "next";

export const SUNDIAL_FAVICON_PATH =
  "/sundial-icon.png?v=fd248483e3d3";

function getStableLogoVersion(logoUrl: string) {
  let hash = 2166136261;

  for (let index = 0; index < logoUrl.length; index += 1) {
    hash ^= logoUrl.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getTenantFaviconPath(
  school: string,
  logoUrl?: string | null
) {
  const path = `/api/schools/${encodeURIComponent(
    school.trim().toLowerCase()
  )}/tab-icon`;
  const normalizedLogoUrl = logoUrl?.trim();

  return normalizedLogoUrl
    ? `${path}?v=${getStableLogoVersion(normalizedLogoUrl)}`
    : path;
}

export function getTenantFaviconIconEntries(
  school: string,
  logoUrl: string | null | undefined
) {
  if (!logoUrl?.trim()) {
    return [{ url: SUNDIAL_FAVICON_PATH }];
  }

  return [{ url: getTenantFaviconPath(school, logoUrl) }];
}

export function getSundialFaviconMetadata(): Metadata {
  return {
    icons: {
      icon: [{ url: SUNDIAL_FAVICON_PATH, type: "image/png" }],
    },
  };
}

export function getTenantFaviconMetadata(
  school: string,
  logoUrl: string | null | undefined
): Metadata {
  return {
    icons: {
      icon: getTenantFaviconIconEntries(school, logoUrl),
    },
  };
}
