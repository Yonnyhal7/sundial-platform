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
import { PWA_LAUNCH_VISUAL } from "@/lib/pwa/launchScreen";
import {
  applyMobileThemeSurface,
  bindMobileThemeSurfaceLifecycle,
} from "@/lib/pwa/mobileThemeSurface";
import { recordPwaResumeDiagnostic } from "@/lib/pwa/resumeDiagnostics";

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
      applyMobileThemeSurface(nextTheme);
      setStoredAppearancePreference("app", nextAppearance, school);
    },
    [school]
  );

  useEffect(() => {
    applyMobileThemeSurface(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const reapplyResolvedTheme = (reason: string) => {
      const nextTheme = resolveAppearanceTheme(appearance);

      setResolvedTheme(nextTheme);
      applyTheme(nextTheme, "app", appearance);
      applyMobileThemeSurface(nextTheme);
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      const backdrop = document.querySelector<HTMLElement>("[data-pwa-status-bar-background]");
      recordPwaResumeDiagnostic(
        "theme_surface_applied",
        `${reason};preference=${appearance};resolved=${nextTheme};html=${getComputedStyle(document.documentElement).backgroundColor};body=${getComputedStyle(document.body).backgroundColor};themeColor=${meta?.content || "missing"};themeColorCount=${document.querySelectorAll('meta[name="theme-color"]').length};safeArea=${backdrop ? getComputedStyle(backdrop).backgroundColor : "missing"}`
      );
    };

    return bindMobileThemeSurfaceLifecycle({
      documentTarget: document,
      windowTarget: window,
      apply: reapplyResolvedTheme,
    });
  }, [appearance]);

  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty("background-color");
      document.documentElement.style.removeProperty("--pwa-theme-surface");
      document.body.style.removeProperty("background-color");
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemThemeChange(event: MediaQueryListEvent) {
      if (appearance !== "system") return;

      const nextTheme = event.matches ? "dark" : "light";
      setResolvedTheme(nextTheme);
      applyTheme(nextTheme, "app", appearance);
      applyMobileThemeSurface(nextTheme);
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
        data-mobile-app-theme-root=""
        suppressHydrationWarning
        style={style}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[79] h-[env(safe-area-inset-top)]"
          data-pwa-status-bar-background=""
          style={{
            backgroundColor:
              resolvedTheme === "dark"
                ? PWA_LAUNCH_VISUAL.backgroundDark
                : PWA_LAUNCH_VISUAL.background,
          }}
        />
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
