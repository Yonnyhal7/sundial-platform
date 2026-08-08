"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  applyTheme,
  getPreferredAppearance,
  resolveAppearanceTheme,
  setStoredAppearancePreference,
  type AppearancePreference,
  type Theme,
} from "@/lib/themeScope";

type MobileAppThemeContextValue = {
  appearance: AppearancePreference;
  resolvedTheme: Theme;
  setAppearance: (appearance: AppearancePreference) => void;
};

const MobileAppThemeContext = createContext<MobileAppThemeContextValue | null>(
  null
);

export default function MobileAppThemeProvider({
  children,
  school,
  schoolDefaultAppearance,
  className,
  style,
}: {
  children: ReactNode;
  school: string;
  schoolDefaultAppearance: AppearancePreference;
  className: string;
  style: CSSProperties;
}) {
  const [appearance, setAppearanceState] = useState<AppearancePreference>(() =>
    getPreferredAppearance("app", schoolDefaultAppearance, school)
  );
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() =>
    resolveAppearanceTheme(
      getPreferredAppearance("app", schoolDefaultAppearance, school)
    )
  );

  const setAppearance = useCallback(
    (nextAppearance: AppearancePreference) => {
      const nextTheme = resolveAppearanceTheme(nextAppearance);

      setAppearanceState(nextAppearance);
      setResolvedTheme(nextTheme);
      applyTheme(nextTheme, "app", nextAppearance);
      setStoredAppearancePreference("app", nextAppearance, school);
    },
    [school]
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemThemeChange(event: MediaQueryListEvent) {
      if (appearance !== "system") return;

      const nextTheme = event.matches ? "dark" : "light";
      setResolvedTheme(nextTheme);
      applyTheme(nextTheme, "app", appearance);
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [appearance]);

  return (
    <MobileAppThemeContext.Provider
      value={{ appearance, resolvedTheme, setAppearance }}
    >
      <div
        className={`${className} ${resolvedTheme === "dark" ? "dark" : ""}`}
        data-app-appearance={appearance}
        data-app-resolved-theme={resolvedTheme}
        suppressHydrationWarning
        style={style}
      >
        {children}
      </div>
    </MobileAppThemeContext.Provider>
  );
}

export function useMobileAppTheme() {
  const context = useContext(MobileAppThemeContext);

  if (!context) {
    throw new Error("useMobileAppTheme must be used within MobileAppThemeProvider");
  }

  return context;
}
