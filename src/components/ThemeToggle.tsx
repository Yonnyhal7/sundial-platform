"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const savedTheme = window.localStorage.getItem("theme");

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

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
  className = "",
}: {
  className?: string;
}) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const preferredTheme = getPreferredTheme();

    applyTheme(preferredTheme);

    const timeout = window.setTimeout(() => {
      setTheme(preferredTheme);
    }, 0);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemThemeChange(event: MediaQueryListEvent) {
      if (window.localStorage.getItem("theme")) {
        return;
      }

      const nextTheme = event.matches ? "dark" : "light";

      setTheme(nextTheme);
      applyTheme(nextTheme);
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      window.clearTimeout(timeout);
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";

  function toggleTheme() {
    setTheme(nextTheme);
    window.localStorage.setItem("theme", nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        "inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary,#2563eb)] focus:ring-offset-2 dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white dark:hover:bg-[#2f2f2f] dark:focus:ring-offset-black",
        className,
      ].join(" ")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
