"use client";

import { useEffect, useState } from "react";
import {
  startPwaUpdateLifecycle,
  type PwaDiagnostics,
} from "@/lib/pwa/updateLifecycle";

export default function ServiceWorkerRegister() {
  const [updateNow, setUpdateNow] = useState<null | (() => void)>(null);
  const [dismissPrompt, setDismissPrompt] = useState<null | (() => void)>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!["http:", "https:"].includes(window.location.protocol)) return;

    try {
      const savedPosition = window.sessionStorage.getItem(
        "sundial:pwa-scroll-position"
      );
      if (savedPosition) {
        window.sessionStorage.removeItem("sundial:pwa-scroll-position");
        const position = JSON.parse(savedPosition) as { x?: number; y?: number };
        window.requestAnimationFrame(() => {
          window.scrollTo(position.x || 0, position.y || 0);
        });
      }
    } catch {
      // Scroll restoration is optional when storage is unavailable.
    }

    let lifecycle: ReturnType<typeof startPwaUpdateLifecycle> | undefined;
    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;
        lifecycle = startPwaUpdateLifecycle({
          serviceWorker: navigator.serviceWorker,
          registration,
          window,
          document,
          onUpdateReady: (applyUpdate) => {
            setUpdateNow(() => applyUpdate);
            setDismissPrompt(() => () => {
              lifecycle?.dismissPrompt();
              setUpdateNow(null);
              setDismissPrompt(null);
            });
          },
          onDiagnostics: (diagnostics: PwaDiagnostics) => {
            try {
              window.sessionStorage.setItem(
                "sundial:pwa-diagnostics",
                JSON.stringify(diagnostics)
              );
            } catch {
              // Diagnostics must not interfere with application startup.
            }
            if (process.env.NODE_ENV !== "production") {
              Object.defineProperty(window, "__SUNDIAL_PWA_DIAGNOSTICS__", {
                configurable: true,
                value: diagnostics,
              });
            }
          },
        });
      })
      .catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[pwa] service worker registration failed", error);
        }
      });

    return () => {
      cancelled = true;
      lifecycle?.dispose();
    };
  }, []);

  if (!updateNow) return null;

  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[100] mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      role="status"
    >
      <p className="text-sm font-bold text-slate-950 dark:text-white">
        A new version of Sundial is ready.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-300 dark:hover:bg-zinc-800"
          onClick={dismissPrompt || undefined}
          type="button"
        >
          Later
        </button>
        <button
          className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-white dark:text-zinc-950"
          onClick={updateNow}
          type="button"
        >
          Update now
        </button>
      </div>
    </aside>
  );
}
