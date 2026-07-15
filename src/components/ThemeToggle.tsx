"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  getPreferredAppearance,
  isDeviceAppearanceScope,
  resolveAppearanceTheme,
  setStoredAppearancePreference,
  type AppearancePreference,
  type Theme,
  type ThemeScope,
} from "@/lib/themeScope";

const appearanceOptions: { value: AppearancePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.8 6.8 0 0 0 9.8 9.8Z"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4V2m0 20v-2m8-8h2M2 12h2m14.95 6.95 1.41 1.41M3.64 3.64l1.41 1.41m0 13.9-1.41 1.41M20.36 3.64l-1.41 1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
      />
    </svg>
  );
}

export default function ThemeToggle({
  scope,
  className = "",
  schoolDefaultAppearance,
  schoolSlug,
  variant = "auto",
}: {
  scope: ThemeScope;
  className?: string;
  schoolDefaultAppearance?: AppearancePreference;
  schoolSlug?: string;
  variant?: "auto" | "icon" | "segmented";
}) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [appearance, setAppearance] = useState<AppearancePreference>("system");
  const isDeviceAppearance = isDeviceAppearanceScope(scope);
  const useSegmentedControl =
    variant === "segmented" || (variant === "auto" && isDeviceAppearance);

  useEffect(() => {
    const preferredAppearance = getPreferredAppearance(
      scope,
      schoolDefaultAppearance,
      schoolSlug
    );
    const preferredTheme = resolveAppearanceTheme(preferredAppearance);

    applyTheme(preferredTheme, scope, preferredAppearance);

    const timeout = window.setTimeout(() => {
      setAppearance(preferredAppearance);
      setTheme(preferredTheme);
    }, 0);
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemThemeChange(event: MediaQueryListEvent) {
      const currentAppearance = getPreferredAppearance(
        scope,
        schoolDefaultAppearance,
        schoolSlug
      );

      if (currentAppearance !== "system") {
        return;
      }

      const nextTheme = event.matches ? "dark" : "light";

      setAppearance(currentAppearance);
      setTheme(nextTheme);
      applyTheme(nextTheme, scope, currentAppearance);
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      window.clearTimeout(timeout);
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [schoolDefaultAppearance, schoolSlug, scope]);

  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";

  function chooseAppearance(nextAppearance: AppearancePreference) {
    const nextResolvedTheme = resolveAppearanceTheme(nextAppearance);

    setAppearance(nextAppearance);
    setTheme(nextResolvedTheme);
    setStoredAppearancePreference(scope, nextAppearance, schoolSlug);
    applyTheme(nextResolvedTheme, scope, nextAppearance);
  }

  function toggleTheme() {
    setTheme(nextTheme);
    setAppearance(nextTheme);
    setStoredAppearancePreference(scope, nextTheme, schoolSlug);
    applyTheme(nextTheme, scope, nextTheme);
  }

  if (useSegmentedControl) {
    return (
      <div
        className={[
          "inline-flex rounded-full border border-slate-300 bg-white p-1 text-xs font-black shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]",
          className,
        ].join(" ")}
        role="radiogroup"
        aria-label={`Appearance. ${appearance} selected`}
      >
        {appearanceOptions.map((option, index) => {
          const selected = appearance === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => chooseAppearance(option.value)}
              onKeyDown={(event) => {
                const lastIndex = appearanceOptions.length - 1;
                let nextIndex: number | null = null;

                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  nextIndex = index === lastIndex ? 0 : index + 1;
                } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  nextIndex = index === 0 ? lastIndex : index - 1;
                } else if (event.key === "Home") {
                  nextIndex = 0;
                } else if (event.key === "End") {
                  nextIndex = lastIndex;
                }

                if (nextIndex === null) {
                  return;
                }

                event.preventDefault();
                chooseAppearance(appearanceOptions[nextIndex].value);
              }}
              className={[
                "rounded-full px-3 py-2 transition focus:outline-none focus:ring-2 focus:ring-[var(--school-primary,#d4a017)] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black",
                selected
                  ? "bg-[var(--school-primary,#d4a017)] text-[var(--school-primary-text,#ffffff)] shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-[#2f2f2f]",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        "inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white dark:hover:bg-[#2f2f2f] dark:focus:ring-zinc-500 dark:focus:ring-offset-black",
        className,
      ].join(" ")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
