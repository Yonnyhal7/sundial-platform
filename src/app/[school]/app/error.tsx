"use client";

import { useEffect } from "react";

export default function MobileAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[mobile-app] route error", error);
    }
  }, [error]);

  return (
    <main className="grid min-h-[50vh] place-items-center">
      <section
        className="w-full rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
        role="alert"
      >
        <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--school-primary)]">
          Sundial
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          This page could not be loaded
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
          Check your connection, then try again. Your school and app location
          will stay the same.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 min-h-11 rounded-full bg-[var(--school-primary)] px-5 py-2.5 text-sm font-black text-[var(--school-primary-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-primary)] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#242424]"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
