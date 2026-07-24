export type Theme = "light" | "dark";
export type AppearancePreference = Theme | "system";
export type ThemeScope = "admin" | "kiosk" | "app" | "site";

export const themeStorageKeys: Record<ThemeScope, string> = {
  admin: "sundial-theme-admin",
  kiosk: "sundial:kiosk:appearance",
  app: "sundial:pwa:appearance",
  site: "sundial-theme-site",
};

const legacyDeviceThemeStorageKeys: Partial<Record<ThemeScope, string>> = {
  kiosk: "sundial-theme-kiosk",
  app: "sundial-theme-app",
};

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function normalizeAppearancePreference(
  value: unknown,
  fallback: AppearancePreference = "system"
): AppearancePreference {
  return isAppearancePreference(value) ? value : fallback;
}

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

export function isDeviceAppearanceScope(scope: ThemeScope) {
  return scope === "app" || scope === "kiosk";
}

export function normalizeThemeTenantSlug(schoolSlug?: string | null) {
  const normalized = schoolSlug?.trim().toLowerCase();

  return normalized || null;
}

export function getTenantThemeStorageKey(
  scope: ThemeScope,
  schoolSlug?: string | null
) {
  const baseKey = getThemeStorageKey(scope);
  const normalizedSchoolSlug = normalizeThemeTenantSlug(schoolSlug);

  if (!isDeviceAppearanceScope(scope) || !normalizedSchoolSlug) {
    return baseKey;
  }

  return `${baseKey}:${normalizedSchoolSlug}`;
}

export function getSchoolSlugFromThemePath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "app" || segments[0] === "kiosk") {
    return null;
  }

  if (segments[1] === "app" || segments[1] === "kiosk") {
    return segments[0] || null;
  }

  return null;
}

export function getSchoolSlugFromThemeLocation(
  pathname: string,
  hostname = ""
) {
  const pathSlug = getSchoolSlugFromThemePath(pathname);

  if (pathSlug) return pathSlug;

  if (!/^\/(?:app|kiosk)(?:\/|$)/.test(pathname)) return null;

  const normalizedHostname = hostname.trim().toLowerCase().split(":")[0];
  const hostnameSegments = normalizedHostname.split(".");
  const candidate = hostnameSegments[0];

  if (
    !candidate ||
    candidate === "admin" ||
    candidate === "www" ||
    candidate === "localhost"
  ) {
    return null;
  }

  if (
    normalizedHostname.endsWith(".sundialk12.com") ||
    normalizedHostname.endsWith(".localhost")
  ) {
    return candidate;
  }

  return null;
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveAppearanceTheme(preference: AppearancePreference): Theme {
  return preference === "system" ? getSystemTheme() : preference;
}

export function getStoredAppearancePreference(
  scope: ThemeScope,
  schoolSlug?: string | null
): AppearancePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = getTenantThemeStorageKey(scope, schoolSlug);
  const savedPreference = window.localStorage.getItem(storageKey);

  if (isAppearancePreference(savedPreference)) {
    return savedPreference;
  }

  if (isDeviceAppearanceScope(scope) && normalizeThemeTenantSlug(schoolSlug)) {
    const globalStorageKey = getThemeStorageKey(scope);
    const globalPreference = window.localStorage.getItem(globalStorageKey);

    if (isAppearancePreference(globalPreference)) {
      window.localStorage.setItem(storageKey, globalPreference);
      window.localStorage.removeItem(globalStorageKey);

      const legacyStorageKey = legacyDeviceThemeStorageKeys[scope];

      if (legacyStorageKey) {
        window.localStorage.removeItem(legacyStorageKey);
      }

      return globalPreference;
    }
  }

  const legacyStorageKey = legacyDeviceThemeStorageKeys[scope];

  if (legacyStorageKey) {
    const legacyPreference = window.localStorage.getItem(legacyStorageKey);

    if (legacyPreference === "light" || legacyPreference === "dark") {
      if (isDeviceAppearanceScope(scope) && normalizeThemeTenantSlug(schoolSlug)) {
        window.localStorage.setItem(storageKey, legacyPreference);
        window.localStorage.removeItem(legacyStorageKey);
      }

      return legacyPreference;
    }
  }

  return null;
}

function getAppliedAppearancePreference(scope: ThemeScope) {
  if (typeof document === "undefined") {
    return null;
  }

  if (document.documentElement.dataset.themeScope !== scope) {
    return null;
  }

  return normalizeAppearancePreference(
    document.documentElement.dataset.themePreference,
    "system"
  );
}

export function getPreferredAppearance(
  scope: ThemeScope,
  schoolDefaultAppearance?: AppearancePreference,
  schoolSlug?: string | null
): AppearancePreference {
  if (isDeviceAppearanceScope(scope)) {
    return (
      getStoredAppearancePreference(scope, schoolSlug) ||
      schoolDefaultAppearance ||
      getAppliedAppearancePreference(scope) ||
      "system"
    );
  }

  const savedPreference = getStoredAppearancePreference(scope);

  if (savedPreference === "light" || savedPreference === "dark") {
    return savedPreference;
  }

  return "system";
}

export function setStoredAppearancePreference(
  scope: ThemeScope,
  preference: AppearancePreference,
  schoolSlug?: string | null
) {
  window.localStorage.setItem(getTenantThemeStorageKey(scope, schoolSlug), preference);
}

export function getPreferredTheme(storageKey: string): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const savedTheme = window.localStorage.getItem(storageKey);

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(
  scope: ThemeScope,
  schoolDefaultAppearance?: AppearancePreference,
  schoolSlug?: string | null
): Theme {
  return resolveAppearanceTheme(
    getPreferredAppearance(scope, schoolDefaultAppearance, schoolSlug)
  );
}

export function applyTheme(
  theme: Theme,
  scope: ThemeScope,
  preference?: AppearancePreference
) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.themeScope = scope;
  document.documentElement.style.colorScheme = theme;

  if (preference) {
    document.documentElement.dataset.themePreference = preference;
  } else {
    delete document.documentElement.dataset.themePreference;
  }
}
