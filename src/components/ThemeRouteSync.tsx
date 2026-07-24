"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  applyTheme,
  getPreferredAppearance,
  getSchoolSlugFromThemeLocation,
  getThemeScopeFromPath,
  resolveAppearanceTheme,
  type AppearancePreference,
} from "@/lib/themeScope";
import { recordPwaResumeDiagnostic } from "@/lib/pwa/resumeDiagnostics";

export default function ThemeRouteSync({
  schoolDefaultAppearance,
  schoolSlug,
}: {
  schoolDefaultAppearance?: AppearancePreference;
  schoolSlug?: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    const scope = getThemeScopeFromPath(pathname, window.location.hostname.toLowerCase());
    const resolvedSchoolSlug =
      schoolSlug ||
      getSchoolSlugFromThemeLocation(pathname, window.location.hostname);
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const preference = getPreferredAppearance(
      scope,
      schoolDefaultAppearance,
      resolvedSchoolSlug
    );

    recordPwaResumeDiagnostic("theme_read", `${scope}:${preference}`);
    applyTheme(resolveAppearanceTheme(preference), scope, preference);
    recordPwaResumeDiagnostic(
      "theme_class_applied",
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );

    function handleSystemThemeChange(event: MediaQueryListEvent) {
      const currentPreference = getPreferredAppearance(
        scope,
        schoolDefaultAppearance,
        resolvedSchoolSlug
      );

      if (currentPreference !== "system") {
        return;
      }

      applyTheme(event.matches ? "dark" : "light", scope, currentPreference);
      recordPwaResumeDiagnostic(
        "theme_class_applied",
        event.matches ? "dark" : "light"
      );
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [pathname, schoolDefaultAppearance, schoolSlug]);

  return null;
}
