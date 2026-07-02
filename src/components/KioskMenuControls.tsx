"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

export default function KioskMenuControls() {
  const pathname = usePathname();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    const timeout = window.setTimeout(handleFullscreenChange, 0);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  if (isFullscreen) {
    return null;
  }

  const showFullscreenButton = pathname.includes("/kiosk");
  const themeScope = showFullscreenButton ? "kiosk" : "site";

  async function enterFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      {showFullscreenButton && (
        <button
          type="button"
          onClick={enterFullscreen}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-[var(--school-primary,#f5b400)] hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary,#f5b400)] focus:ring-offset-2 focus:ring-offset-white dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-neutral-100 dark:hover:bg-[#2f2f2f] dark:hover:text-white dark:focus:ring-offset-black"
        >
          Full Screen
        </button>
      )}
      <ThemeToggle scope={themeScope} />
    </div>
  );
}
