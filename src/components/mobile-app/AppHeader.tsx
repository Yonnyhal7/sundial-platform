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

type QuickLink = {
  title: string;
  href: string;
};

type AppHeaderProps = {
  school: string;
  schoolName: string;
  logoUrl: string | null;
  quickLinks: QuickLink[];
  schoolDefaultAppearance: AppearancePreference;
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

function NotificationSection({
  title,
  notifications,
}: {
  title: string;
  notifications: {
    icon: string;
    title: string;
    message: string;
    time: string;
    unread: boolean;
  }[];
}) {
  if (notifications.length === 0) return null;

  return (
    <section>
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-[#a3a3a3]">
        {title}
      </h3>
      <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:divide-[#3a3a3a] dark:border-[#3a3a3a] dark:bg-[#242424]">
        {notifications.map((notification) => (
          <article key={notification.title} className="flex gap-3 px-4 py-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[var(--school-accent-visible-card)] text-xs font-black text-[var(--school-secondary-text)]">
              {notification.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-black">{notification.title}</h4>
                {notification.unread && (
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--school-accent-visible-card)]" />
                )}
              </div>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 dark:text-[#a3a3a3]">
                {notification.message}
              </p>
              <p className="mt-2 text-[0.7rem] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-[#8b8b8b]">
                {notification.time}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function AppHeader({
  school,
  schoolName,
  logoUrl,
  quickLinks,
  schoolDefaultAppearance,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsMounted, setNotificationsMounted] = useState(false);
  const [appearance, setAppearance] = useState<AppearancePreference>(
    schoolDefaultAppearance
  );
  const homeHref = `/${school}/app`;
  const todayNotifications = [
    {
      icon: "!",
      title: "Principal Announcement",
      message: "Please check today's school update.",
      time: "Just now",
      unread: true,
    },
    {
      icon: "S",
      title: "Rally Schedule Tomorrow",
      message: "Tomorrow will follow the rally schedule.",
      time: "12 min ago",
      unread: true,
    },
    {
      icon: "A",
      title: "Football starts in 30 minutes",
      message: "Varsity football begins soon.",
      time: "30 min ago",
      unread: true,
    },
  ];
  const earlierNotifications = [
    {
      icon: "R",
      title: "New resource posted",
      message: "A new student resource is available.",
      time: "Yesterday",
      unread: false,
    },
    {
      icon: "E",
      title: "Event updated",
      message: "An upcoming event has been updated.",
      time: "Yesterday",
      unread: false,
    },
  ];
  const unreadCount = [...todayNotifications, ...earlierNotifications].filter(
    (notification) => notification.unread
  ).length;

  useEffect(() => {
    const preferredAppearance = getPreferredAppearance(
      "app",
      schoolDefaultAppearance,
      school
    );
    const preferredTheme = resolveAppearanceTheme(preferredAppearance);

    applyTheme(preferredTheme, "app", preferredAppearance);

    const timeout = window.setTimeout(() => {
      setAppearance(preferredAppearance);
    }, 0);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystem = () => {
      const currentAppearance = getPreferredAppearance(
        "app",
        schoolDefaultAppearance,
        school
      );

      if (currentAppearance === "system") {
        applyTheme(resolveAppearanceTheme(currentAppearance), "app", currentAppearance);
      }
    };

    media.addEventListener("change", syncSystem);
    return () => {
      window.clearTimeout(timeout);
      media.removeEventListener("change", syncSystem);
    };
  }, [school, schoolDefaultAppearance]);

  useEffect(() => {
    if (!menuMounted && !notificationsMounted) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (menuMounted) closeMenu();
        if (notificationsMounted) closeNotifications();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuMounted, notificationsMounted]);

  function openMenu() {
    setMenuMounted(true);
    window.requestAnimationFrame(() => setMenuOpen(true));
  }

  function closeMenu() {
    setMenuOpen(false);
    window.setTimeout(() => setMenuMounted(false), 260);
  }

  function openNotifications() {
    setNotificationsMounted(true);
    window.requestAnimationFrame(() => setNotificationsOpen(true));
  }

  function closeNotifications() {
    setNotificationsOpen(false);
    window.setTimeout(() => setNotificationsMounted(false), 260);
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
          <SchoolLogo schoolName={schoolName} logoUrl={logoUrl} size="md" />
        </Link>

        <button
          type="button"
          aria-label="Open notifications"
          onClick={openNotifications}
          className="relative grid h-[clamp(3rem,8vw,4rem)] w-[clamp(3rem,8vw,4rem)] place-items-center rounded-[clamp(0.9rem,2.4vw,1.35rem)] border border-transparent bg-[var(--school-primary)] text-[var(--school-primary-text)] shadow-[0_10px_24px_rgb(15_23_42/0.08)]"
        >
          <BellIcon className="h-[clamp(1.25rem,3vw,1.75rem)] w-[clamp(1.25rem,3vw,1.75rem)]" />
          <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-[var(--school-accent-visible-primary)] ring-2 ring-[var(--school-primary)]" />
        </button>
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
                <SchoolLogo schoolName={schoolName} logoUrl={logoUrl} size="lg" />
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

      {notificationsMounted && (
        <div
          className={`fixed inset-0 z-[80] transition-colors duration-[250ms] ease-out ${
            notificationsOpen ? "bg-black/30" : "bg-black/0"
          }`}
          onClick={closeNotifications}
        >
          <aside
            className={`ml-auto flex h-full w-[80vw] max-w-sm flex-col overflow-y-auto rounded-l-[1.75rem] bg-slate-50 text-slate-950 shadow-[-18px_0_36px_rgb(0_0_0/0.24)] transition-transform duration-[250ms] ease-out dark:bg-black dark:text-white ${
              notificationsOpen ? "translate-x-0" : "translate-x-full"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[var(--school-primary)] p-5 text-[var(--school-primary-text)]">
              <button
                type="button"
                onClick={closeNotifications}
                className="mb-6 flex w-fit items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--school-primary-text)_26%,transparent)] bg-[color-mix(in_srgb,var(--school-primary-text)_10%,transparent)] px-4 py-2 text-sm font-black transition hover:bg-[color-mix(in_srgb,var(--school-primary-text)_16%,transparent)]"
              >
                <BackArrowIcon />
                Back
              </button>

              <Link
                href={homeHref}
                onClick={closeNotifications}
                className="mx-auto block w-fit"
              >
                <SchoolLogo schoolName={schoolName} logoUrl={logoUrl} size="lg" />
              </Link>
              <p className="mt-4 truncate text-center text-xl font-black">{schoolName}</p>
              <div className="mt-6 flex items-end justify-between gap-4 border-t border-[color-mix(in_srgb,var(--school-primary-text)_24%,transparent)] pt-5">
                <div>
                  <h2 className="text-2xl font-black">Notifications</h2>
                  <p className="mt-1 text-sm font-semibold text-[color-mix(in_srgb,var(--school-primary-text)_76%,transparent)]">
                    School communication
                  </p>
                </div>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-[var(--school-accent-visible-primary)] px-2.5 py-1 text-xs font-black text-[var(--school-secondary-text)]">
                    {unreadCount} unread
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 p-5">
              {[...todayNotifications, ...earlierNotifications].length === 0 ? (
                <div className="grid min-h-52 place-items-center rounded-3xl border border-slate-200 bg-white p-6 text-center dark:border-[#3a3a3a] dark:bg-[#242424]">
                  <p className="text-base font-black">You&apos;re all caught up.</p>
                </div>
              ) : (
                <div className="space-y-7">
                  <NotificationSection title="Today" notifications={todayNotifications} />
                  <NotificationSection title="Earlier" notifications={earlierNotifications} />
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
