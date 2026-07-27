"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { GlobeIcon } from "@/components/admin/AdminNavIcons";
import { getCanonicalSchoolWebsiteUrl } from "@/lib/routing/paths";
import type { AppearancePreference } from "@/lib/themeScope";

function subscribeToHostname() {
  return () => {};
}

function getBrowserHostname() {
  return window.location.hostname;
}

function getServerHostname() {
  return "";
}

export default function KioskMenuControls({
  school,
  schoolDefaultAppearance,
}: {
  school: string;
  schoolDefaultAppearance?: AppearancePreference;
}) {
  const pathname = usePathname();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hostname = useSyncExternalStore(
    subscribeToHostname,
    getBrowserHostname,
    getServerHostname
  );

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
  const websiteHref = getCanonicalSchoolWebsiteUrl(school, pathname, hostname);

  async function enterFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      {showFullscreenButton && (
        <>
          <a
            href={websiteHref}
            aria-label="Back to Website"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-[var(--school-primary,#f5b400)] hover:bg-neutral-100 hover:text-neutral-950 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary,#f5b400)] focus:ring-offset-2 focus:ring-offset-white dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-neutral-100 dark:hover:bg-[#2f2f2f] dark:hover:text-white dark:focus:ring-offset-black"
          >
            <GlobeIcon className="h-4 w-4 shrink-0" />
            <span>Back to Website</span>
          </a>
          <button
            type="button"
            onClick={enterFullscreen}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-[var(--school-primary,#f5b400)] hover:bg-neutral-100 hover:text-neutral-950 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary,#f5b400)] focus:ring-offset-2 focus:ring-offset-white dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-neutral-100 dark:hover:bg-[#2f2f2f] dark:hover:text-white dark:focus:ring-offset-black"
          >
            Full Screen
          </button>
        </>
      )}
      <ThemeToggle
        scope={themeScope}
        schoolDefaultAppearance={
          themeScope === "kiosk" ? schoolDefaultAppearance : undefined
        }
        schoolSlug={themeScope === "kiosk" ? school : undefined}
      />
    </div>
  );
}
