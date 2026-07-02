"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  getThemeScopeFromPath,
  getThemeStorageKey,
  type Theme,
} from "@/lib/themeScope";

function getPreferredTheme(storageKey: string): Theme {
  const savedTheme = window.localStorage.getItem(storageKey);

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme, scope: string) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.themeScope = scope;
}

export default function ThemeRouteSync() {
  const pathname = usePathname();

  useEffect(() => {
    const scope = getThemeScopeFromPath(pathname);
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
