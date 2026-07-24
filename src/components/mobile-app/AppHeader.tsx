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
import {
  isNotificationAudience,
  type NotificationAudience,
} from "@/lib/notifications";
import { createNotificationDeviceIdentity, getNotificationDeviceIdentity, notificationDeviceHeaders } from "@/lib/notifications/deviceClient";
import NotificationAudienceSummary from "@/components/mobile-app/NotificationAudienceSummary";

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
};

type NotificationDeviceState = {
  schoolId: string;
  status: "checking" | "missing" | "registered";
  audience: NotificationAudience | null;
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
  schoolId,
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
  const [inboxNotifications, setInboxNotifications] = useState<Array<{ icon: string; title: string; message: string; time: string; unread: boolean }>>([]);
  const [reportedUnreadCount, setReportedUnreadCount] = useState(0);
  const [notificationAudience, setNotificationAudience] = useState<NotificationAudience>("student");
  const [notificationSetupState, setNotificationSetupState] = useState("");
  const [notificationDeviceState, setNotificationDeviceState] = useState<NotificationDeviceState>({
    schoolId,
    status: "checking",
    audience: null,
  });
  const currentNotificationDeviceState = notificationDeviceState.schoolId === schoolId
    ? notificationDeviceState
    : { schoolId, status: "checking" as const, audience: null };
  const registeredNotificationAudience = currentNotificationDeviceState.status === "registered"
    ? currentNotificationDeviceState.audience
    : null;
  const homeHref = `/${school}/app`;
  const todayNotifications = inboxNotifications.filter((notification) => notification.time !== "Earlier");
  const earlierNotifications = inboxNotifications.filter((notification) => notification.time === "Earlier");
  const visibleUnreadCount = [...todayNotifications, ...earlierNotifications].filter(
    (notification) => notification.unread
  ).length;
  const unreadCount = Math.max(visibleUnreadCount, reportedUnreadCount);

  useEffect(() => {
    const identity = getNotificationDeviceIdentity(schoolId);
    if (!identity) {
      const missingTimeout = window.setTimeout(() => {
        setNotificationDeviceState({ schoolId, status: "missing", audience: null });
      }, 0);
      return () => window.clearTimeout(missingTimeout);
    }
    const controller = new AbortController();
    fetch(`/api/schools/${encodeURIComponent(school)}/notifications`, { headers: notificationDeviceHeaders(identity), signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        const persistedAudience = String(payload?.audience || "");
        if (!isNotificationAudience(persistedAudience)) {
          setNotificationDeviceState({ schoolId, status: "missing", audience: null });
          return;
        }
        setNotificationDeviceState({
          schoolId,
          status: "registered",
          audience: persistedAudience,
        });
        const rows = Array.isArray(payload?.notifications) ? payload.notifications : [];
        setReportedUnreadCount(Number.isSafeInteger(payload?.unreadCount) ? Math.max(0, payload.unreadCount) : 0);
        setInboxNotifications(rows.map((row: { read_at?: string | null; created_at?: string; notification_campaigns?: { title?: string; body?: string; category?: string } }) => {
          const date = new Date(row.created_at || 0);
          const sameDay = date.toDateString() === new Date().toDateString();
          return { icon: String(row.notification_campaigns?.category || "N").slice(0, 1).toUpperCase(), title: row.notification_campaigns?.title || "School notification", message: row.notification_campaigns?.body || "", time: sameDay ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Earlier", unread: !row.read_at };
        }));
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setNotificationDeviceState({ schoolId, status: "missing", audience: null });
      });
    return () => {
      controller.abort();
    };
  }, [school, schoolId, notificationsMounted]);

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

  async function enableNotifications() {
    setNotificationSetupState("working");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error();
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error();
      const identity = getNotificationDeviceIdentity(schoolId) || createNotificationDeviceIdentity(schoolId);
      const headers = { ...notificationDeviceHeaders(identity), "content-type": "application/json" };
      const registered = await fetch(`/api/schools/${encodeURIComponent(school)}/notifications`, {
        method: "POST", headers,
        body: JSON.stringify({ action: "register", audience: notificationAudience, platform: navigator.platform || "unknown", browser: navigator.userAgent.slice(0, 40), pwaInstalled: window.matchMedia("(display-mode: standalone)").matches, notificationsSupported: true, permissionStatus: permission }),
      });
      if (!registered.ok) throw new Error();
      const config = await fetch("/api/notifications/config").then((response) => response.json());
      const bytes = Uint8Array.from(atob(String(config.publicKey).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(config.publicKey).length / 4) * 4, "=")), (character) => character.charCodeAt(0));
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      const saved = await fetch(`/api/schools/${encodeURIComponent(school)}/notifications`, { method: "POST", headers, body: JSON.stringify({ action: "subscribe", subscription: subscription.toJSON() }) });
      if (!saved.ok) throw new Error();
      const verified = await fetch(`/api/schools/${encodeURIComponent(school)}/notifications`, {
        headers: notificationDeviceHeaders(identity),
      });
      const verifiedPayload = verified.ok ? await verified.json() : null;
      const verifiedAudience = String(verifiedPayload?.audience || "");
      if (!isNotificationAudience(verifiedAudience)) throw new Error();
      setNotificationSetupState("enabled");
      setNotificationDeviceState({
        schoolId,
        status: "registered",
        audience: verifiedAudience,
      });
    } catch {
      setNotificationSetupState("error");
    }
  }

  async function markAllNotificationsRead() {
    const identity = getNotificationDeviceIdentity(schoolId);
    if (!identity) return;
    const response = await fetch(`/api/schools/${encodeURIComponent(school)}/notifications`, {
      method: "POST",
      headers: { ...notificationDeviceHeaders(identity), "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_read", deliveryId: "all" }),
    });
    if (response.ok) {
      setReportedUnreadCount(0);
      setInboxNotifications((current) => current.map((notification) => ({ ...notification, unread: false })));
    }
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

        <button
          type="button"
          aria-label="Open notifications"
          onClick={openNotifications}
          className="relative grid h-[clamp(3rem,8vw,4rem)] w-[clamp(3rem,8vw,4rem)] place-items-center rounded-[clamp(0.9rem,2.4vw,1.35rem)] border border-transparent bg-[var(--school-primary)] text-[var(--school-primary-text)] shadow-[0_10px_24px_rgb(15_23_42/0.08)]"
        >
          <BellIcon className="h-[clamp(1.25rem,3vw,1.75rem)] w-[clamp(1.25rem,3vw,1.75rem)]" />
          {unreadCount > 0 && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-purple-500 ring-2 ring-[var(--school-primary)]" />}
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
                <SchoolLogo
                  schoolName={schoolName}
                  logoUrl={logoUrl}
                  variant="preview"
                  className="h-16 w-16"
                />
              </Link>
              <p className="mt-4 truncate text-center text-xl font-black">{schoolName}</p>
              <div className="mt-6 flex items-end justify-between gap-4 border-t border-[color-mix(in_srgb,var(--school-primary-text)_24%,transparent)] pt-5">
                <NotificationAudienceSummary audience={registeredNotificationAudience} />
                {unreadCount > 0 && (
                  <button type="button" onClick={markAllNotificationsRead} className="rounded-full bg-[var(--school-accent-visible-primary)] px-2.5 py-1 text-xs font-black text-[var(--school-secondary-text)]">
                    Mark {unreadCount} read
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 p-5">
              {[...todayNotifications, ...earlierNotifications].length === 0 ? (
                <div className="grid min-h-52 place-items-center rounded-3xl border border-slate-200 bg-white p-6 text-center dark:border-[#3a3a3a] dark:bg-[#242424]">
                  <div><p className="text-base font-black">You&apos;re all caught up.</p>
                  {currentNotificationDeviceState.status === "missing" && <div className="mt-5"><label className="block text-xs font-black uppercase tracking-wider text-slate-500">This device is for<select value={notificationAudience} onChange={(event) => { if (isNotificationAudience(event.target.value)) setNotificationAudience(event.target.value); }} className="mt-2 w-full rounded-lg border p-2 dark:bg-black"><option value="student">Student</option><option value="parent">Parent</option><option value="staff">Staff</option></select></label><button type="button" onClick={enableNotifications} disabled={notificationSetupState === "working"} className="mt-3 rounded-lg bg-[var(--school-primary)] px-4 py-2 text-sm font-black text-[var(--school-primary-text)]">{notificationSetupState === "working" ? "Enabling…" : "Enable notifications"}</button>{notificationSetupState === "error" && <p className="mt-2 text-xs text-red-600">Notifications could not be enabled. Check browser permission and try again.</p>}</div>}</div>
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
