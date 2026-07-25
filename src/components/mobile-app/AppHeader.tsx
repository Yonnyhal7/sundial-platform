"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BellIcon,
  MenuIcon,
} from "@/components/mobile-app/AppIcons";
import SchoolLogo from "@/components/SchoolLogo";
import {
  applyTheme,
  getPreferredAppearance,
  resolveAppearanceTheme,
  setStoredAppearancePreference,
  type AppearancePreference,
} from "@/lib/themeScope";
import { isNotificationAudience } from "@/lib/notifications";
import { getNotificationDeviceIdentity, notificationDeviceHeaders } from "@/lib/notifications/deviceClient";
import { usePwaStartup } from "@/components/pwa/PwaStartupBoundary";
import {
  NOTIFICATION_INBOX_CHANGED_EVENT,
  readCachedInbox,
} from "@/lib/notifications/inboxClient";

type QuickLink = {
  title: string;
  href: string;
};

type AppHeaderProps = {
  schoolId: string;
  school: string;
  schoolName: string;
  logoUrl: string | null;
  quickLinks: QuickLink[];
  schoolDefaultAppearance: AppearancePreference;
  timeZone: string;
};

function BackArrowIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 12H5M11 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 5h5v5M19 5l-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AppHeader({
  schoolId,
  school,
  schoolName,
  logoUrl,
  quickLinks,
  schoolDefaultAppearance,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [appearance, setAppearance] = useState<AppearancePreference>(
    schoolDefaultAppearance
  );
  const [reportedUnreadCount, setReportedUnreadCount] = useState(0);
  const { startupReady } = usePwaStartup();
  const homeHref = `/${school}/app`;
  const unreadCount = reportedUnreadCount;

  useEffect(() => {
    if (!startupReady) return;
    const cached = readCachedInbox(schoolId);
    const cachedUpdate = cached
      ? window.setTimeout(() => setReportedUnreadCount(cached.unreadCount), 0)
      : null;
    const identity = getNotificationDeviceIdentity(schoolId);
    if (!identity) return;
    const controller = new AbortController();
    fetch(`/api/schools/${encodeURIComponent(school)}/notifications`, { headers: notificationDeviceHeaders(identity), signal: controller.signal })
      .then(async (response) => {
        if (response.ok) return response.json();
        if (response.status === 401 || response.status === 404) return null;
        throw new Error("device_lookup_failed");
      })
      .then((payload) => {
        const persistedAudience = String(payload?.audience || "");
        if (!isNotificationAudience(persistedAudience)) return;
        setReportedUnreadCount(Number.isSafeInteger(payload?.unreadCount) ? Math.max(0, payload.unreadCount) : 0);
      }).catch(() => undefined);
    return () => {
      controller.abort();
      if (cachedUpdate !== null) window.clearTimeout(cachedUpdate);
    };
  }, [school, schoolId, startupReady]);

  useEffect(() => {
    function handleInboxChange(event: Event) {
      const count = (event as CustomEvent<{ unreadCount?: number }>).detail?.unreadCount;
      if (count === 0) setReportedUnreadCount(0);
      else if (Number.isSafeInteger(count)) setReportedUnreadCount(Math.max(0, count || 0));
    }
    window.addEventListener(NOTIFICATION_INBOX_CHANGED_EVENT, handleInboxChange);
    return () => window.removeEventListener(NOTIFICATION_INBOX_CHANGED_EVENT, handleInboxChange);
  }, []);

  useEffect(() => {
    const preferredAppearance = getPreferredAppearance(
      "app",
      schoolDefaultAppearance,
      school
    );

    const timeout = window.setTimeout(() => {
      setAppearance(preferredAppearance);
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [school, schoolDefaultAppearance]);

  useEffect(() => {
    if (!menuMounted) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (menuMounted) closeMenu();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuMounted]);

  function openMenu() {
    setMenuMounted(true);
    window.requestAnimationFrame(() => setMenuOpen(true));
  }

  function closeMenu() {
    setMenuOpen(false);
    window.setTimeout(() => setMenuMounted(false), 260);
  }

  function setUserAppearance(nextAppearance: AppearancePreference) {
    const nextTheme = resolveAppearanceTheme(nextAppearance);

    setAppearance(nextAppearance);
    setStoredAppearancePreference("app", nextAppearance, school);
    applyTheme(nextTheme, "app", nextAppearance);
  }

  return (
    <>
      <header className="relative flex items-center justify-between gap-[clamp(0.75rem,2.2vw,1rem)]">
        <button
          type="button"
          aria-label="Open utilities"
          onClick={openMenu}
          className="grid h-[clamp(3rem,8vw,4rem)] w-[clamp(3rem,8vw,4rem)] place-items-center rounded-[clamp(0.9rem,2.4vw,1.35rem)] border border-transparent bg-[var(--school-primary)] text-[var(--school-primary-text)] shadow-[0_10px_24px_rgb(15_23_42/0.08)]"
        >
          <MenuIcon className="h-[clamp(1.25rem,3vw,1.75rem)] w-[clamp(1.25rem,3vw,1.75rem)]" />
        </button>

        <Link
          href={homeHref}
          aria-label="Go to home"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <SchoolLogo
            schoolName={schoolName}
            logoUrl={logoUrl}
            variant="appHeader"
          />
        </Link>

        <Link
          href={`/${school}/app/notifications`}
          aria-label={unreadCount > 0 ? `Open notifications, ${unreadCount} unread` : "Open notifications"}
          className="relative grid h-[clamp(3rem,8vw,4rem)] w-[clamp(3rem,8vw,4rem)] place-items-center rounded-[clamp(0.9rem,2.4vw,1.35rem)] border border-transparent bg-[var(--school-primary)] text-[var(--school-primary-text)] shadow-[0_10px_24px_rgb(15_23_42/0.08)]"
        >
          <BellIcon className="h-[clamp(1.25rem,3vw,1.75rem)] w-[clamp(1.25rem,3vw,1.75rem)]" />
          {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-[var(--school-accent-visible-primary)] px-1 text-[0.65rem] font-black text-[var(--school-secondary-text)] ring-2 ring-[var(--school-primary)]">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </Link>
      </header>

      {menuMounted && (
        <div
          className={`fixed inset-0 z-[80] transition-colors duration-[250ms] ease-out ${
            menuOpen ? "bg-black/30" : "bg-black/0"
          }`}
          onClick={closeMenu}
        >
          <aside
            className={`flex h-full w-[80vw] max-w-sm flex-col overflow-y-auto rounded-r-[1.75rem] bg-slate-50 text-slate-950 shadow-[18px_0_36px_rgb(0_0_0/0.24)] transition-transform duration-[250ms] ease-out dark:bg-black dark:text-white ${
              menuOpen ? "translate-x-0" : "-translate-x-full"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[var(--school-primary)] p-5 text-[var(--school-primary-text)]">
            <button
              type="button"
              onClick={closeMenu}
              className="mb-6 flex w-fit items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--school-primary-text)_26%,transparent)] bg-[color-mix(in_srgb,var(--school-primary-text)_10%,transparent)] px-4 py-2 text-sm font-black transition hover:bg-[color-mix(in_srgb,var(--school-primary-text)_16%,transparent)]"
            >
              <BackArrowIcon />
              Back
            </button>

            <div className="border-b border-[color-mix(in_srgb,var(--school-primary-text)_24%,transparent)] pb-6 text-center">
              <Link
                href={homeHref}
                onClick={closeMenu}
                className="mx-auto block w-fit"
              >
                <SchoolLogo
                  schoolName={schoolName}
                  logoUrl={logoUrl}
                  variant="preview"
                  className="h-16 w-16"
                />
              </Link>
              <p className="mt-4 truncate text-center text-xl font-black">{schoolName}</p>
            </div>
            </div>

            <div className="flex flex-1 flex-col p-5">
            <div className="space-y-7">
            <section>
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-[#a3a3a3]">
                Quick Links
              </h2>
              <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:divide-[#3a3a3a] dark:border-[#3a3a3a] dark:bg-[#242424]">
                {quickLinks.length > 0 ? (
                  quickLinks.map((link) => (
                    <Link
                      key={`${link.title}-${link.href}`}
                      href={link.href}
                      onClick={closeMenu}
                      className="flex items-center justify-between gap-3 px-4 py-4 text-sm font-black transition hover:bg-slate-100 dark:hover:bg-[#181818]"
                    >
                      <span>{link.title}</span>
                      <ExternalLinkIcon />
                    </Link>
                  ))
                ) : (
                  <p className="p-4 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                    No quick links are configured yet.
                  </p>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-[#a3a3a3]">
                School Information
              </h2>
              <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:divide-[#3a3a3a] dark:border-[#3a3a3a] dark:bg-[#242424]">
                {[
                  "Main Office",
                  "Attendance Office",
                  "Counseling Office",
                  "Athletics Office",
                  "Principal",
                  "Address",
                  "Phone Number",
                  "School Website",
                ].map((label) => (
                  <div key={label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <span className="font-black">{label}</span>
                    <span className="text-right text-xs font-semibold text-slate-500 dark:text-[#a3a3a3]">
                      Not configured
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-[#a3a3a3]">
                Appearance
              </h2>
              <div className="mt-3 grid gap-2">
                {(["light", "dark", "system"] as const).map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black capitalize transition ${
                      appearance === option
                        ? "border-[var(--school-primary)] bg-[color-mix(in_srgb,var(--school-primary)_10%,transparent)]"
                        : "border-slate-200 bg-white hover:bg-slate-100 dark:border-[#3a3a3a] dark:bg-[#242424] dark:hover:bg-[#181818]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="appAppearance"
                      value={option}
                      checked={appearance === option}
                      onChange={() => setUserAppearance(option)}
                      className="h-4 w-4 accent-[var(--school-primary)]"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </section>
            </div>

            <section className="mt-auto pt-8">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-[#3a3a3a] dark:bg-[#242424]">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-[#a3a3a3]">
                  Support
                </h2>
                <p className="mt-3 text-sm font-black">Need help?</p>
                <a href="mailto:support@mrhcodes.com" className="mt-1 block text-sm font-semibold text-[var(--school-primary)] underline-offset-4 hover:underline">
                  support@mrhcodes.com
                </a>
              </div>
            </section>
            </div>
          </aside>
        </div>
      )}

    </>
  );
}
