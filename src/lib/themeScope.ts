export type Theme = "light" | "dark";
export type ThemeScope = "admin" | "kiosk" | "app" | "site";

export const themeStorageKeys: Record<ThemeScope, string> = {
  admin: "sundial-theme-admin",
  kiosk: "sundial-theme-kiosk",
  app: "sundial-theme-app",
  site: "sundial-theme-site",
};

export function getThemeScopeFromPath(
  pathname: string,
  hostname = ""
): ThemeScope {
  if (
    hostname.startsWith("admin.") ||
    /^\/admin(?:\/|$)/.test(pathname) ||
    /^\/[^/]+\/admin(?:\/|$)/.test(pathname)
  ) {
    return "admin";
  }

  if (/^\/kiosk(?:\/|$)/.test(pathname) || /^\/[^/]+\/kiosk(?:\/|$)/.test(pathname)) {
    return "kiosk";
  }

  if (/^\/app(?:\/|$)/.test(pathname) || /^\/[^/]+\/app(?:\/|$)/.test(pathname)) {
    return "app";
  }

  return "site";
}

export function getThemeStorageKey(scope: ThemeScope) {
  return themeStorageKeys[scope];
}
