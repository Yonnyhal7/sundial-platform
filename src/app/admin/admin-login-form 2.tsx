"use client";

import { createBrowserClient } from "@supabase/ssr";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { getAdminUtilityPath } from "@/lib/routing/paths";
import {
  applyTheme,
  getPreferredAppearance,
  resolveAppearanceTheme,
} from "@/lib/themeScope";
import { sundialPrimaryButtonClass } from "@/lib/ui/buttonStyles";

export default function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const preference = getPreferredAppearance("admin");

    applyTheme(resolveAppearanceTheme(preference), "admin", preference);
    const readyTimeout = window.setTimeout(() => {
      setThemeReady(true);
    }, 0);

    function handleSystemThemeChange(event: MediaQueryListEvent) {
      const currentPreference = getPreferredAppearance("admin");

      if (currentPreference !== "system") {
        return;
      }

      applyTheme(event.matches ? "dark" : "light", "admin", currentPreference);
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      window.clearTimeout(readyTimeout);
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();

    setLoading(true);
    setError(null);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(
      getAdminUtilityPath(
        window.location.pathname,
        window.location.hostname.toLowerCase(),
        "/dashboard"
      )
    );
    router.refresh();
  }

  return (
    <main
      className={[
        "relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-100 px-4 py-16 text-slate-950 transition-opacity duration-150 dark:bg-[#0b1120] dark:text-white sm:px-6 lg:px-8",
        themeReady ? "opacity-100" : "opacity-0",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(212,160,23,0.12),_transparent_34rem)] dark:bg-[radial-gradient(circle_at_top,_rgba(212,160,23,0.16),_transparent_36rem)]" />

      <div className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle
          scope="admin"
          variant="segmented"
          className="border-slate-200/90 bg-white/95 text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur dark:border-white/10 dark:bg-slate-900/90 dark:text-slate-100"
        />
      </div>

      <form
        onSubmit={handleLogin}
        className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/10 dark:border-white/10 dark:bg-[#111827] dark:shadow-black/35 sm:p-8"
      >
        <div className="flex items-center gap-3">
          <Image
            src="/sundial-icon.png"
            alt=""
            width={44}
            height={48}
            className="h-11 w-11 object-contain"
            priority
          />
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9A7209] dark:text-[#F6C64A]">
              Sundial
            </p>
            <p className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Sundial Admin
            </p>
          </div>
        </div>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
          Sign in
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Access school setup, administration, and platform management.
        </p>

        <div className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="admin-login-email"
              className="text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Email
            </label>
            <input
              id="admin-login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#D4A017] focus:ring-2 focus:ring-[#D4A017]/25 dark:border-white/10 dark:bg-[#0b1220] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-[#D4A017] dark:focus:ring-[#D4A017]/35"
            />
          </div>

          <div>
            <label
              htmlFor="admin-login-password"
              className="text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Password
            </label>
            <input
              id="admin-login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#D4A017] focus:ring-2 focus:ring-[#D4A017]/25 dark:border-white/10 dark:bg-[#0b1220] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-[#D4A017] dark:focus:ring-[#D4A017]/35"
            />
          </div>

          {error && (
            <p
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={sundialPrimaryButtonClass("w-full py-3.5 text-base font-semibold")}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </div>
      </form>
    </main>
  );
}
