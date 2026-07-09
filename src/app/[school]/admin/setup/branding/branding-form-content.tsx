"use client";

import { useEffect, useState } from "react";
import SchoolLogo, { getSchoolInitials } from "@/components/SchoolLogo";
import {
  getContrastTextColor,
  getVisibleAccentColor,
  isLightColor,
} from "@/lib/schoolTheme";

type DefaultAppearance = "light" | "dark" | "system";
type PreviewMode = "light" | "dark";

type BrandingFormContentProps = {
  schoolName: string;
  mascot: string | null;
  logoUrl: string | null;
  initialPrimaryColor: string;
  initialSecondaryColor: string;
  initialDefaultAppearance: DefaultAppearance;
};

const appearanceOptions: {
  value: DefaultAppearance;
  icon: string;
  label: string;
  background: string;
  text: string;
  border: string;
}[] = [
  {
    value: "light",
    icon: "\u2600\uFE0F",
    label: "Light",
    background: "#FFFFFF",
    text: "#07152F",
    border: "#E2E8F0",
  },
  {
    value: "dark",
    icon: "\uD83C\uDF19",
    label: "Dark",
    background: "#FFFFFF",
    text: "#07152F",
    border: "#E2E8F0",
  },
  {
    value: "system",
    icon: "\uD83D\uDCBB",
    label: "System",
    background: "#FFFFFF",
    text: "#07152F",
    border: "#E2E8F0",
  },
];

function getTextOnColor(backgroundColor: string) {
  return getContrastTextColor(backgroundColor);
}

function useSystemPreviewMode(appearance: DefaultAppearance) {
  const [systemMode, setSystemMode] = useState<PreviewMode>("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncMode = () => setSystemMode(media.matches ? "dark" : "light");

    syncMode();
    media.addEventListener("change", syncMode);
    return () => media.removeEventListener("change", syncMode);
  }, []);

  if (appearance === "system") return systemMode;
  return appearance;
}

function getPreviewColors(mode: PreviewMode) {
  const isDark = mode === "dark";

  return {
    isDark,
    page: isDark ? "#050505" : "#F8FAFC",
    card: isDark ? "#242424" : "#FFFFFF",
    cardAlt: isDark ? "#181818" : "#F1F5F9",
    border: isDark ? "#3A3A3A" : "#E2E8F0",
    text: isDark ? "#FFFFFF" : "#07152F",
    muted: isDark ? "#9CA3AF" : "#64748B",
    shadow: isDark ? "none" : "0 12px 32px rgb(15 23 42 / 0.08)",
  };
}

const websitePreviewThemes = {
  light: {
    frame: "#F8FAFC",
    main: "#F8FAFC",
    sidebar: "#2F3338",
    card: "#FFFFFF",
    text: "#0F172A",
    muted: "#64748B",
    border: "#E2E8F0",
    shadow: "0 12px 32px rgb(15 23 42 / 0.08)",
  },
  dark: {
    frame: "#0A0A0A",
    main: "#0A0A0A",
    sidebar: "#202124",
    card: "#262626",
    text: "#FFFFFF",
    muted: "#A1A1AA",
    border: "#3A3A3A",
    shadow: "none",
  },
} satisfies Record<PreviewMode, Record<string, string>>;

function MenuGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BellGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KioskClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8"
        stroke="currentColor"
        strokeWidth="2.1"
      />
      <path
        d="M12 7.5V12l3 1.8"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KioskCalendarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3v4M17 3v4M5 8.5h14M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 13h2.5M8 16h4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function KioskMegaphoneIcon() {
  return (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.7 4.3a1.4 1.4 0 0 0-1.45-.2L7.8 8.7H5.2A2.2 2.2 0 0 0 3 10.9v2.2a2.2 2.2 0 0 0 2.2 2.2h.6l1.8 3.2a1.8 1.8 0 0 0 2.45.7l.55-.3a1.8 1.8 0 0 0 .7-2.45l-.55-.98 7.5 3.35a1.4 1.4 0 0 0 1.95-1.28V5.35a1.4 1.4 0 0 0-.5-1.05ZM7.1 15.3h1.25l1.2 2.12-.55.31L7.1 15.3ZM5.2 10.7h2.05v2.6H5.2a.2.2 0 0 1-.2-.2v-2.2a.2.2 0 0 1 .2-.2Zm13 5.78-8.95-4v-.96l8.95-4v8.96Z" />
    </svg>
  );
}

function AppNavIcon({ type }: { type: "home" | "schedule" | "events" | "resources" | "more" }) {
  if (type === "home") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 10.6 12 3l9 7.6v9.1a1.3 1.3 0 0 1-1.3 1.3h-4.6v-6.2H8.9V21H4.3A1.3 1.3 0 0 1 3 19.7v-9.1Z" />
      </svg>
    );
  }

  if (type === "schedule") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2.2" />
        <path d="M12 7.2V12l3.2 2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "events") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 5h14v15H5V5Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
        <path d="M8 3v4M16 3v4M5 9h14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "resources") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4.5 7.5h6l1.8 2h7.2v9h-15v-11Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h.01M12 12h.01M19 12h.01" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

function WebsitePreview({
  schoolName,
  logoUrl,
  initials,
  primaryColor,
  secondaryColor,
  mode,
}: {
  schoolName: string;
  logoUrl: string | null;
  initials: string;
  primaryColor: string;
  secondaryColor: string;
  mode: PreviewMode;
}) {
  const theme = websitePreviewThemes[mode];
  const primaryTextColor = getTextOnColor(primaryColor);
  const visibleAccentColor = getVisibleAccentColor(secondaryColor, theme.card);

  return (
    <div
      className="overflow-hidden rounded-[1.35rem] border"
      style={{
        backgroundColor: theme.frame,
        borderColor: theme.border,
        color: theme.text,
        boxShadow: theme.shadow,
      }}
    >
      <div
        className="grid min-h-[25.75rem] md:grid-cols-[10.5rem_minmax(0,1fr)]"
        style={{ backgroundColor: theme.main, color: theme.text }}
      >
        <aside
          className="flex flex-col gap-4 p-4"
          style={{ backgroundColor: theme.sidebar, color: "#FFFFFF" }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <SchoolLogo
              schoolName={schoolName}
              logoUrl={logoUrl}
              size="md"
              className="h-9 w-9 rounded-full text-[10px]"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-black" style={{ color: "#FFFFFF" }}>
                Sundial
              </p>
              <p
                className="truncate text-[10px] font-bold"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                {schoolName}
              </p>
            </div>
          </div>

          <nav className="space-y-1.5 text-xs font-black">
            {["Dashboard", "Schedules", "Calendar", "Events", "Announcements", "Athletics", "Resources", "Users"].map(
              (item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
                  style={{
                    backgroundColor: index === 0 ? primaryColor : "transparent",
                    color: index === 0 ? primaryTextColor : "rgba(255,255,255,0.82)",
                  }}
                >
                  <span className="grid h-3.5 w-3.5 place-items-center rounded border border-current text-[8px]">
                    {item.slice(0, 1)}
                  </span>
                  <span>{item}</span>
                </div>
              )
            )}
          </nav>
        </aside>

        <main className="p-4" style={{ backgroundColor: theme.main, color: theme.text }}>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3
                className="text-2xl font-black tracking-tight"
                style={{ color: theme.text }}
              >
                Dashboard
              </h3>
              <p
                className="mt-3 text-base font-black"
                style={{ color: theme.text }}
              >
                Welcome back, Admin!
              </p>
              <p className="mt-1 text-xs font-semibold" style={{ color: theme.muted }}>
                Here&apos;s what&apos;s happening today at {schoolName}.
              </p>
              <div
                className="mt-2 h-1 w-16 rounded-full"
                style={{ backgroundColor: primaryColor }}
              />
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-black"
              style={{ backgroundColor: primaryColor, color: primaryTextColor }}
            >
              {schoolName}
            </span>
          </header>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <article
              className="rounded-xl border p-3 lg:min-h-28"
              style={{ backgroundColor: primaryColor, borderColor: primaryColor, color: primaryTextColor }}
            >
              <p className="text-[10px] font-semibold" style={{ color: primaryTextColor }}>
                Today is
              </p>
              <p
                className="mt-5 text-xl font-black leading-tight"
                style={{ color: primaryTextColor }}
              >
                NO SCHEDULE ASSIGNED
              </p>
            </article>

            <article
              className="rounded-xl border p-3"
              style={{ backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}
            >
              <p className="text-[10px] font-semibold" style={{ color: theme.text }}>
                Students
              </p>
              <p
                className="mt-6 text-xl font-black"
                style={{ color: theme.text }}
              >
                1
              </p>
              <p className="mt-2.5 text-[10px] font-semibold" style={{ color: theme.muted }}>
                Active Users
              </p>
            </article>

            <article
              className="rounded-xl border p-3"
              style={{ backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}
            >
              <p className="text-[10px] font-semibold" style={{ color: theme.text }}>
                Upcoming Events
              </p>
              <p
                className="mt-6 text-xl font-black"
                style={{ color: theme.text }}
              >
                0
              </p>
              <p className="mt-2.5 text-[10px] font-semibold" style={{ color: theme.muted }}>
                This Week
              </p>
            </article>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <article
              className="rounded-xl border p-3"
              style={{ backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}
            >
              <p className="text-[10px] font-semibold" style={{ color: theme.text }}>
                Announcements
              </p>
              <p
                className="mt-6 text-xl font-black"
                style={{ color: theme.text }}
              >
                1
              </p>
              <span
                className="mt-2.5 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black"
                style={{
                  backgroundColor: visibleAccentColor,
                  color: getContrastTextColor(visibleAccentColor),
                }}
              >
                New
              </span>
            </article>

            <article
              className="rounded-xl border p-3 lg:col-span-2"
              style={{ backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}
            >
              <p className="text-[10px] font-black" style={{ color: theme.text }}>
                Quick Actions
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {["New Announcement", "Add Event", "Manage Resources"].map((action) => (
                  <button
                    key={action}
                    type="button"
                    className="rounded-lg px-2.5 py-2 text-[9px] font-black"
                    style={{ backgroundColor: primaryColor, color: primaryTextColor }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}
function AppPreview({
  schoolName,
  logoUrl,
  initials,
  primaryColor,
  secondaryColor,
  mode,
}: {
  schoolName: string;
  logoUrl: string | null;
  initials: string;
  primaryColor: string;
  secondaryColor: string;
  mode: PreviewMode;
}) {
  const colors = getPreviewColors(mode);
  const primaryTextColor = getTextOnColor(primaryColor);
  const primaryAccentText =
    (mode === "light" && isLightColor(primaryColor)) ||
    (mode === "dark" && !isLightColor(primaryColor))
      ? colors.text
      : primaryColor;
  const secondaryAccentText =
    (mode === "light" && isLightColor(secondaryColor)) ||
    (mode === "dark" && !isLightColor(secondaryColor))
      ? colors.text
      : secondaryColor;
  const visibleCardAccentColor = getVisibleAccentColor(secondaryColor, colors.card);
  const visiblePageAccentColor = getVisibleAccentColor(secondaryColor, colors.page);
  const visiblePrimaryAccentColor = getVisibleAccentColor(secondaryColor, primaryColor);
  const ringBackground = `conic-gradient(${visibleCardAccentColor} 72%, ${colors.isDark ? "#3A3A3A" : "#E6E8EE"} 72% 100%)`;

  return (
    <div
      className="mx-auto flex min-h-[27.5rem] w-full max-w-[13.5rem] flex-1 rounded-[1.45rem] border p-2.5"
      style={{
        backgroundColor: colors.page,
        borderColor: colors.border,
        color: colors.text,
        boxShadow: colors.shadow,
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.1rem]">
        <header className="relative flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Menu preview"
            className="grid h-9 w-9 place-items-center rounded-xl border"
            style={{
              backgroundColor: primaryColor,
              borderColor: primaryColor,
              color: primaryTextColor,
            }}
          >
            <MenuGlyph />
          </button>

          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <SchoolLogo schoolName={schoolName} logoUrl={logoUrl} size="sm" />
          </div>

          <button
            type="button"
            aria-label="Notifications preview"
            className="relative grid h-9 w-9 place-items-center rounded-xl border"
            style={{
              backgroundColor: primaryColor,
              borderColor: primaryColor,
              color: primaryTextColor,
            }}
          >
            <BellGlyph />
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full"
              style={{ backgroundColor: visiblePrimaryAccentColor }}
            />
          </button>
        </header>

        <section className="px-1 pt-5 text-center">
          <p className="text-sm font-medium leading-tight" style={{ color: primaryAccentText }}>
            Good morning,
          </p>
          <h3
            className="mt-1.5 text-lg font-black leading-none tracking-tight"
            style={{ color: primaryAccentText }}
          >
            {schoolName}
          </h3>
          <p className="mt-3 text-[10px] font-black" style={{ color: colors.muted }}>
            Wednesday, July 8
          </p>
          <div
            className="mx-auto mt-3 h-0.5 w-10 rounded-full"
            style={{ backgroundColor: visiblePageAccentColor }}
          />
        </section>

        <div className="flex-1 pt-4">
          <article
            className="rounded-[1.1rem] border px-4 py-4 text-center"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <p
              className="text-[10px] font-black uppercase tracking-[0.16em]"
              style={{ color: secondaryAccentText }}
            >
              Current Period
            </p>
            <h4 className="mt-2.5 text-base font-black leading-tight">No Active Period</h4>

            <div className="mt-3 flex justify-center">
              <div
                className="grid h-24 w-24 place-items-center rounded-full p-2"
                style={{ background: ringBackground }}
              >
                <div
                  className="flex h-full w-full flex-col items-center justify-center rounded-full text-center"
                  style={{ backgroundColor: colors.card }}
                >
                  <p
                    className="text-[9px] font-black uppercase tracking-wide"
                    style={{ color: colors.muted }}
                  >
                    Starts In
                  </p>
                  <p className="mt-1.5 text-lg font-black leading-none">Done</p>
                </div>
              </div>
            </div>
          </article>
        </div>

        <nav
          className="mt-3 grid grid-cols-5 rounded-[1rem] border px-0.5 py-1.5 text-center text-[0.42rem] font-black"
          style={{
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.muted,
          }}
        >
          {[
            { label: "Home", icon: "home" },
            { label: "Schedule", icon: "schedule" },
            { label: "Events", icon: "events" },
            { label: "Resources", icon: "resources" },
            { label: "More", icon: "more" },
          ].map((item, index) => {
            const active = index === 0;

            return (
              <span
                key={item.label}
                className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 py-1"
                style={{
                  color: active ? primaryAccentText : colors.muted,
                  backgroundColor: active
                    ? `color-mix(in srgb, ${primaryColor} 10%, transparent)`
                    : "transparent",
                }}
              >
                <AppNavIcon type={item.icon as "home" | "schedule" | "events" | "resources" | "more"} />
                <span className="max-w-full truncate">{item.label}</span>
              </span>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function KioskPreview({
  schoolName,
  mascot,
  logoUrl,
  initials,
  primaryColor,
  secondaryColor,
  mode,
}: {
  schoolName: string;
  mascot: string | null;
  logoUrl: string | null;
  initials: string;
  primaryColor: string;
  secondaryColor: string;
  mode: PreviewMode;
}) {
  const colors = getPreviewColors(mode);
  const primaryTextColor = getContrastTextColor(primaryColor);
  const visibleCardAccentColor = getVisibleAccentColor(secondaryColor, colors.card);
  const ringTrackColor = colors.isDark ? "#3A3A3A" : "#E6E8EE";
  const mutedBorderColor = colors.isDark ? "#3A3A3A" : "#D8DEE8";
  const ringBackground = `conic-gradient(${visibleCardAccentColor} 0deg, ${visibleCardAccentColor} 0deg, ${ringTrackColor} 0deg 360deg)`;
  const cheerText = mascot?.trim() ? `Go ${mascot.trim()}!` : "Go Sundial!";

  return (
    <div
      className="flex flex-col overflow-hidden rounded-[1.35rem] border"
      style={{
        aspectRatio: "16 / 9",
        backgroundColor: colors.page,
        borderColor: colors.border,
        color: colors.text,
        boxShadow: colors.shadow,
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col p-3 pb-0">
        <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 pb-3">
          <h3 className="truncate text-2xl font-black leading-none tracking-tight sm:text-3xl">
            {schoolName}
          </h3>

          <p
            className="pt-2 text-center text-xs font-semibold sm:text-sm"
            style={{ color: colors.muted }}
          >
            Wednesday, July 8, 2026
          </p>

          <div className="flex justify-end gap-1 text-right">
            <p className="text-4xl font-black leading-none tracking-tight sm:text-5xl">
              9:50
            </p>
            <div className="pt-0.5">
              <p className="text-base font-black leading-none sm:text-lg">PM</p>
              <p className="mt-1 text-sm font-black leading-none" style={{ color: colors.muted }}>
                :59
              </p>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[1.24fr_1fr] gap-3">
          <section
            className="flex min-h-0 flex-col overflow-hidden rounded-2xl border p-5 text-center"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <p
              className="text-sm font-black uppercase tracking-[0.14em]"
              style={{ color: visibleCardAccentColor }}
            >
              Current Period
            </p>
            <h4 className="mt-4 text-4xl font-black leading-none tracking-tight">
              No Active Period
            </h4>

            <div className="flex flex-1 items-center justify-center">
              <div
                className="grid h-36 w-36 place-items-center rounded-full p-4"
                style={{ background: ringBackground }}
              >
                <div
                  className="flex h-full w-full flex-col items-center justify-center rounded-full text-center"
                  style={{ backgroundColor: colors.card }}
                >
                  <p
                    className="text-xs font-black uppercase tracking-wide"
                    style={{ color: colors.muted }}
                  >
                    Starts In
                  </p>
                  <p className="mt-2 text-4xl font-black leading-none">0:00</p>
                </div>
              </div>
            </div>

            <div
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t pt-4 text-left"
              style={{ borderColor: mutedBorderColor }}
            >
              <div className="flex items-center justify-end gap-2">
                <span className="grid h-6 w-6 place-items-center" style={{ color: visibleCardAccentColor }}>
                  <KioskClockIcon />
                </span>
                <div>
                  <p className="text-[10px] font-black uppercase" style={{ color: colors.muted }}>
                    Next Period
                  </p>
                  <p className="text-sm font-black">End of Day</p>
                </div>
              </div>
              <div className="h-10 w-px" style={{ backgroundColor: mutedBorderColor }} />
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center" style={{ color: visibleCardAccentColor }}>
                  <KioskCalendarIcon />
                </span>
                <div>
                  <p className="text-[10px] font-black uppercase" style={{ color: colors.muted }}>
                    Day Type
                  </p>
                  <p className="text-sm font-black">No Schedule Assigned</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid min-h-0 grid-rows-[1.35fr_1fr_0.85fr] gap-3">
            <article
              className="rounded-2xl border p-4"
              style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
              <p
                className="text-sm font-black uppercase tracking-[0.12em]"
                style={{ color: visibleCardAccentColor }}
              >
                Today&apos;s Schedule
              </p>
            </article>

            <article
              className="rounded-2xl border p-4"
              style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
              <p
                className="text-sm font-black uppercase tracking-[0.12em]"
                style={{ color: visibleCardAccentColor }}
              >
                Today&apos;s Games
              </p>
              <p className="mt-8 text-sm font-black" style={{ color: colors.muted }}>
                No games today
              </p>
              <div className="mt-8 flex justify-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.border }} />
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: visibleCardAccentColor }} />
              </div>
            </article>

            <article
              className="rounded-2xl border p-4"
              style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
              <p
                className="text-sm font-black uppercase tracking-[0.12em]"
                style={{ color: visibleCardAccentColor }}
              >
                Priority Announcement
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center" style={{ color: visibleCardAccentColor }}>
                  <KioskMegaphoneIcon />
                </span>
                <div>
                  <p className="text-base font-black">CTEC</p>
                  <p className="text-xs font-semibold" style={{ color: colors.muted }}>
                    PLC AT CTEC
                  </p>
                </div>
              </div>
            </article>
          </section>
        </div>
      </div>

      <div
        className="grid h-7 shrink-0 grid-cols-[2rem_1fr_2rem] items-center px-2 text-sm font-black"
        style={{ backgroundColor: primaryColor, color: primaryTextColor }}
      >
        <span
          className="grid h-5 w-5 place-items-center rounded-full border text-[8px]"
          style={{ borderColor: primaryTextColor }}
        >
          <SchoolLogo
            schoolName={schoolName}
            logoUrl={logoUrl}
            size="sm"
            className="h-4 w-4 rounded-full border-0 text-[7px]"
          />
        </span>
        <span className="text-center">{cheerText}</span>
        <span />
      </div>
    </div>
  );
}

export default function BrandingFormContent({
  schoolName,
  mascot,
  logoUrl,
  initialPrimaryColor,
  initialSecondaryColor,
  initialDefaultAppearance,
}: BrandingFormContentProps) {
  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initialSecondaryColor);
  const [defaultAppearance, setDefaultAppearance] = useState(
    initialDefaultAppearance
  );
  const previewMode = useSystemPreviewMode(defaultAppearance);
  const initials = getSchoolInitials(schoolName);

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-700 dark:bg-[#242424]">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        Step 3
      </p>
      <h2 className="mt-2 text-2xl font-bold">Appearance</h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Customize how your school will look across the website, app, and future Sundial experiences.
      </p>

      <div className="mt-8 space-y-10">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-black/30">
          <div className="grid gap-6 lg:grid-cols-2">
            <label className="text-sm font-semibold">
              School Color
              <span className="mt-2 flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-black">
                <input
                  name="primaryColor"
                  type="color"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                  className="h-12 w-16 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-black"
                />
                <span className="font-mono text-sm font-normal text-slate-500 dark:text-slate-400">
                  {primaryColor.toUpperCase()}
                </span>
              </span>
            </label>

            <label className="text-sm font-semibold">
              Accent Color
              <span className="mt-2 flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-black">
                <input
                  name="secondaryColor"
                  type="color"
                  value={secondaryColor}
                  onChange={(event) => setSecondaryColor(event.target.value)}
                  className="h-12 w-16 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-black"
                />
                <span className="font-mono text-sm font-normal text-slate-500 dark:text-slate-400">
                  {secondaryColor.toUpperCase()}
                </span>
              </span>
            </label>
          </div>

          <fieldset className="mt-7">
            <legend className="text-sm font-semibold">Default Appearance</legend>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {appearanceOptions.map((option) => {
                const selected = defaultAppearance === option.value;

                return (
                  <label key={option.value} className="cursor-pointer">
                    <input
                      type="radio"
                      name="defaultAppearance"
                      value={option.value}
                      checked={selected}
                      onChange={() => setDefaultAppearance(option.value)}
                      className="peer sr-only"
                    />
                    <span
                      className={[
                        "flex min-h-24 items-center justify-between gap-4 rounded-lg border p-4 shadow-sm transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#D4A017]",
                        selected ? "ring-2 ring-[#D4A017]/25" : "",
                      ].join(" ")}
                      style={{
                        backgroundColor: option.background,
                        borderColor: selected ? "#D4A017" : option.border,
                        color: option.text,
                      }}
                    >
                      <span className="flex items-center gap-3">
                          <span className="text-2xl" aria-hidden="true">
                            {option.icon}
                          </span>
                          <span
                            className="text-sm font-black"
                            style={{ color: option.text }}
                          >
                            {option.label}
                          </span>
                        </span>
                      {selected && (
                        <span className="rounded-full bg-[#D4A017]/15 px-2.5 py-1 text-xs font-black text-[#8a6500] ring-1 ring-[#D4A017]/30">
                          Selected
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {defaultAppearance === "system" && (
              <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                System preview follows this browser&apos;s current color preference.
              </p>
            )}
          </fieldset>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-black/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Live Preview
            </p>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-[#242424] dark:text-slate-300 dark:ring-slate-700">
              {defaultAppearance === "system"
                ? `System (${previewMode})`
                : defaultAppearance}
            </span>
          </div>

          <div className="mt-4 space-y-5">
            <div className="min-w-0">
              <h3 className="mb-2 text-xs font-bold">Website Preview</h3>
              <WebsitePreview
                schoolName={schoolName}
                logoUrl={logoUrl}
                initials={initials}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                mode={previewMode}
              />
            </div>

            <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(13.5rem,16rem)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col">
                <h3 className="mb-2 text-xs font-bold">App Preview</h3>
                <AppPreview
                  schoolName={schoolName}
                  logoUrl={logoUrl}
                  initials={initials}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  mode={previewMode}
                />
              </div>

              <div className="min-w-0">
                <h3 className="mb-2 text-xs font-bold">Kiosk Preview</h3>
                <KioskPreview
                  schoolName={schoolName}
                  mascot={mascot}
                  logoUrl={logoUrl}
                  initials={initials}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  mode={previewMode}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
