import type { AppearancePreference, ThemeScope } from "@/lib/themeScope";

type ThemeBootstrapOptions = {
  scope?: ThemeScope;
  schoolSlug?: string;
  schoolDefaultAppearance?: AppearancePreference;
};

function serializeOptions(options: ThemeBootstrapOptions) {
  return JSON.stringify(options).replaceAll("<", "\\u003c");
}

export function getThemeBootstrapScript(
  options: ThemeBootstrapOptions = {}
) {
  return `(() => {
    const options = ${serializeOptions(options)};
    const root = document.documentElement;
    const path = window.location.pathname;
    const host = window.location.hostname.toLowerCase();
    const valid = (value) => value === "light" || value === "dark" || value === "system";
    const pathSegments = path.split("/").filter(Boolean);
    const inferredScope =
      host.startsWith("admin.") || /^\\/admin(?:\\/|$)/.test(path) || /^\\/[^/]+\\/admin(?:\\/|$)/.test(path)
        ? "admin"
        : /^\\/kiosk(?:\\/|$)/.test(path) || /^\\/[^/]+\\/kiosk(?:\\/|$)/.test(path)
          ? "kiosk"
          : /^\\/app(?:\\/|$)/.test(path) || /^\\/[^/]+\\/app(?:\\/|$)/.test(path)
            ? "app"
            : "site";
    const scope = options.scope || inferredScope;
    const pathSlug =
      pathSegments[0] === "app" || pathSegments[0] === "kiosk"
        ? null
        : pathSegments[1] === "app" || pathSegments[1] === "kiosk"
          ? pathSegments[0]
          : null;
    const hostParts = host.split(".");
    const hostSlug =
      hostParts.length > 2 && !["admin", "www"].includes(hostParts[0])
        ? hostParts[0]
        : host.endsWith(".localhost") && hostParts[0] !== "admin"
          ? hostParts[0]
          : null;
    const schoolSlug = (options.schoolSlug || pathSlug || hostSlug || "").trim().toLowerCase();
    const baseKeys = {
      admin: "sundial-theme-admin",
      kiosk: "sundial:kiosk:appearance",
      app: "sundial:pwa:appearance",
      site: "sundial-theme-site"
    };
    const tenantScoped = (scope === "app" || scope === "kiosk") && schoolSlug;
    const storageKey = tenantScoped ? baseKeys[scope] + ":" + schoolSlug : baseKeys[scope];
    let stored = null;
    try {
      stored = window.localStorage.getItem(storageKey);
      if (!valid(stored) && tenantScoped) {
        const legacy = window.localStorage.getItem(baseKeys[scope]);
        if (valid(legacy)) {
          stored = legacy;
          window.localStorage.setItem(storageKey, legacy);
          window.localStorage.removeItem(baseKeys[scope]);
        }
      }
    } catch {}
    const preference =
      valid(stored)
        ? stored
        : valid(options.schoolDefaultAppearance)
          ? options.schoolDefaultAppearance
          : "system";
    const dark =
      preference === "dark" ||
      (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const record = (type, detail) => {
      const event = {
        type,
        at: new Date().toISOString(),
        visibility: document.visibilityState || "unavailable",
        ...(detail ? { detail } : {})
      };
      const key = "sundial:pwa-resume-diagnostics";
      const events = [...(window.__SUNDIAL_PWA_RESUME_DIAGNOSTICS__ || []), event].slice(-48);
      window.__SUNDIAL_PWA_RESUME_DIAGNOSTICS__ = events;
      try { window.sessionStorage.setItem(key, JSON.stringify(events)); } catch {}
    };
    record("theme_read", scope + ":" + preference);
    root.classList.toggle("dark", dark);
    root.dataset.themeScope = scope;
    root.dataset.themePreference = preference;
    root.style.colorScheme = dark ? "dark" : "light";
    record("theme_class_applied", dark ? "dark" : "light");
  })();`;
}
