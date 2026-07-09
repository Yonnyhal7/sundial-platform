"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  applyTheme,
  getPreferredTheme,
  getThemeScopeFromPath,
  getThemeStorageKey,
} from "@/lib/themeScope";

export default function ThemeRouteSync() {
  const pathname = usePathname();

  useEffect(() => {
    const scope = getThemeScopeFromPath(pathname, window.location.hostname.toLowerCase());
    const storageKey = getThemeStorageKey(scope);
    const theme = getPreferredTheme(storageKey);
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    applyTheme(theme, scope);

    function handleSystemThemeChange(event: MediaQueryListEvent) {
      if (window.localStorage.getItem(storageKey)) {
        return;
      }

      applyTheme(event.matches ? "dark" : "light", scope);
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [pathname]);

  return null;
}
