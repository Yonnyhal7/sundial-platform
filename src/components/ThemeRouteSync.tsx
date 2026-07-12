"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  applyTheme,
  getPreferredAppearance,
  getSchoolSlugFromThemePath,
  getThemeScopeFromPath,
  resolveAppearanceTheme,
  type AppearancePreference,
} from "@/lib/themeScope";

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
    const resolvedSchoolSlug = schoolSlug || getSchoolSlugFromThemePath(pathname);
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const preference = getPreferredAppearance(
      scope,
      schoolDefaultAppearance,
      resolvedSchoolSlug
    );

    applyTheme(resolveAppearanceTheme(preference), scope, preference);

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
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [pathname, schoolDefaultAppearance, schoolSlug]);

  return null;
}
