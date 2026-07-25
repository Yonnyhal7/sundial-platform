import type { Metadata } from "next";

export const SUNDIAL_FAVICON_PATH = "/favicon.ico";

export function getTenantFaviconPath(school: string) {
  return `/api/schools/${encodeURIComponent(
    school.trim().toLowerCase()
  )}/tab-icon`;
}

export function getTenantFaviconIconEntries(
  school: string,
  logoUrl: string | null | undefined
) {
  if (!logoUrl?.trim()) {
    return [{ url: SUNDIAL_FAVICON_PATH }];
  }

  return [
    { url: getTenantFaviconPath(school) },
    { url: SUNDIAL_FAVICON_PATH },
  ];
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
