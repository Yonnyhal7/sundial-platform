"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { calculateKioskViewportLayout } from "@/lib/kioskViewport";
import SchoolLogo from "@/components/SchoolLogo";
import SportIcon from "@/components/SportIcon";
import { getSchoolThemeModes } from "@/lib/schoolTheme";
import {
  formatCountdownDuration,
  getTodayScheduleState,
  sortPeriodsByScheduleOrder,
  type SchedulePeriod,
} from "@/lib/scheduleTime";
import { getTimeZoneClockParts } from "@/lib/timezones";

type Period = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  rawStartTime: string;
  rawEndTime: string;
  sortOrder: number | null;
};

type EventItem = {
  id: string;
  title: string;
  date: string;
};

type GameItem = {
  id: string;
  title: string;
  teamName: string;
  opponent: string;
  time: string;
  location: string;
  sportIcon: string;
  sportIconColor: string | null;
};

type Announcement = {
  title: string;
  body: string;
};

type KioskDisplayProps = {
  schoolName: string;
  schoolPrimaryColor: string;
  schoolSecondaryColor: string;
  schoolMascot?: string | null;
  schoolLogoUrl?: string | null;
  dayType: string;
  scheduleNeedsTimes?: boolean;
  periods: Period[];
  events: EventItem[];
  games: GameItem[];
  athleticsHref: string;
  announcement?: Announcement | null;
  isNoSchool?: boolean;
  noSchoolLabel?: string;
  timeZone: string;
};

type KioskStyle = CSSProperties & {
  "--school-primary": string;
  "--school-secondary": string;
  "--school-primary-text": string;
  "--school-secondary-text": string;
  "--school-accent-visible-light": string;
  "--school-accent-visible-dark": string;
  "--school-accent-visible-card-light": string;
  "--school-accent-visible-card-dark": string;
  "--school-primary-visible-card-light": string;
  "--school-primary-visible-card-dark": string;
};

const KIOSK_DATA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function KioskViewport({ children, style }: { children: React.ReactNode; style: KioskStyle }) {
  const stageRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<ReturnType<typeof calculateKioskViewportLayout> | null>(null);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const bounds = stage.getBoundingClientRect();
      setLayout(calculateKioskViewportLayout(bounds.width, bounds.height));
    };
    const observer = new ResizeObserver(update);
    const viewport = window.visualViewport;
    const documentOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    observer.observe(stage);
    viewport?.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    document.addEventListener("fullscreenchange", update);
    update();
    return () => {
      observer.disconnect();
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      document.removeEventListener("fullscreenchange", update);
      document.documentElement.style.overflow = documentOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);
  return (
    <main ref={stageRef} className="kiosk-theme kiosk-viewport-stage overflow-hidden bg-[var(--kiosk-bg)] text-[var(--kiosk-text)]" style={style}>
      <div data-kiosk-canvas className="absolute left-0 top-0 h-[1080px] w-[1920px] overflow-hidden" style={{ transform: layout ? `translate3d(${layout.left}px, ${layout.top}px, 0) scale(${layout.scale})` : "scale(0)", transformOrigin: "top left", visibility: layout ? "visible" : "hidden" }}>
        {children}
      </div>
    </main>
  );
}

function getHexLuminance(color: string) {
  const match = color.match(/^#([0-9a-f]{6})$/i);

  if (!match) return null;

  const [red, green, blue] = [0, 2, 4].map((start) => {
    const value = parseInt(match[1].slice(start, start + 2), 16) / 255;

    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getSportIconBadgeStyle(color: string | null): CSSProperties {
  if (!color) {
    return {
      backgroundColor: "#fff2cc",
      color: "#f59e0b",
    };
  }

  const luminance = getHexLuminance(color);

  if (luminance !== null && luminance > 0.72) {
    return {
      backgroundColor: "#1f2937",
      color,
    };
  }

  return {
    backgroundColor: `${color}1f`,
    color,
  };
}

function formatClock(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatSeconds(date: Date, timeZone: string) {
  return `:${getTimeZoneClockParts(date, timeZone).second.toString().padStart(2, "0")}`;
}

function formatDateLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getAmPm(date: Date, timeZone: string) {
  return getTimeZoneClockParts(date, timeZone).hour >= 12 ? "PM" : "AM";
}

function CalendarStarIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 12.3.95 2 2.2.32-1.6 1.55.38 2.18L12 17.33l-1.95 1.02.38-2.18-1.6-1.55 2.2-.32.97-2Z" />
    </svg>
  );
}

function ScheduleDayIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 13h3M8 16h5M15.5 13.5h.01" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <circle cx="12" cy="12" r="8.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

export default function KioskDisplay({
  schoolName,
  schoolPrimaryColor,
  schoolSecondaryColor,
  schoolMascot,
  schoolLogoUrl,
  dayType,
  scheduleNeedsTimes = false,
  periods,
  events,
  games,
  athleticsHref,
  announcement,
  isNoSchool = false,
  noSchoolLabel = "Enjoy your day",
  timeZone,
}: KioskDisplayProps) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [activeInfoCard, setActiveInfoCard] = useState<"events" | "games">("events");
  const [rotationReset, setRotationReset] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setNow(new Date());
    }, 0);

    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveInfoCard((current) => (current === "events" ? "games" : "events"));
    }, 10000);

    return () => window.clearInterval(interval);
  }, [rotationReset]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      router.refresh();
    }, KIOSK_DATA_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [router]);

  const schedulePeriods = useMemo<SchedulePeriod[]>(
    () =>
      periods.map((period) => ({
        id: period.id,
        name: period.name,
        start_time: period.rawStartTime,
        end_time: period.rawEndTime,
        sort_order: period.sortOrder,
      })),
    [periods]
  );

  const sortedPeriods = useMemo(() => {
    const byId = new Map(periods.map((period) => [period.id, period]));

    return sortPeriodsByScheduleOrder(schedulePeriods)
      .map((period) => byId.get(period.id))
      .filter((period): period is Period => Boolean(period));
  }, [periods, schedulePeriods]);

  const periodState = useMemo(() => {
    if (!now) {
      return {
        currentPeriod: null,
        nextPeriod: null,
        countdownLabel: "TIME REMAINING" as const,
        countdown: "0:00",
        completedPeriodIds: [] as string[],
        progressPercent: 0,
        isDayComplete: false,
      };
    }

    const state = getTodayScheduleState(schedulePeriods, now, {
      needsTimes: scheduleNeedsTimes,
      timeZone,
    });
    const byId = new Map(sortedPeriods.map((period) => [period.id, period]));

    return {
      currentPeriod: state.currentPeriod ? byId.get(state.currentPeriod.id) ?? null : null,
      nextPeriod: state.nextPeriod ? byId.get(state.nextPeriod.id) ?? null : null,
      countdownLabel: state.countdownLabel.toUpperCase() as "TIME REMAINING" | "STARTS IN" | "SCHOOL DAY COMPLETE",
      countdown: state.countdownTarget
        ? formatCountdownDuration(state.countdownTarget.getTime() - now.getTime())
        : "0:00",
      completedPeriodIds: state.completedPeriodIds,
      progressPercent: state.progressPercent,
      isDayComplete: state.status === "after_school",
    };
  }, [now, scheduleNeedsTimes, schedulePeriods, sortedPeriods, timeZone]);

  if (!now) {
    return null;
  }

  const currentPeriod = periodState.currentPeriod;
  const nextPeriod = periodState.nextPeriod;
  const currentPeriodTitle = periodState.isDayComplete
    ? "School Day Complete"
    : scheduleNeedsTimes
      ? dayType
      : currentPeriod?.name ?? "No Active Period";
  const countdownIsLong = periodState.countdown.includes("hr");
  const schoolTheme = getSchoolThemeModes({
    primary_color: schoolPrimaryColor,
    secondary_color: schoolSecondaryColor,
  });
  const kioskStyle = {
    "--school-primary": schoolTheme.light.schoolColor,
    "--school-secondary": schoolTheme.light.accentColor,
    "--school-primary-text": schoolTheme.light.schoolColorText,
    "--school-secondary-text": schoolTheme.light.accentColorText,
    "--school-accent-visible-light": schoolTheme.light.visibleAccentOnPage,
    "--school-accent-visible-dark": schoolTheme.dark.visibleAccentOnPage,
    "--school-accent-visible-card-light": schoolTheme.light.visibleAccentOnCard,
    "--school-accent-visible-card-dark": schoolTheme.dark.visibleAccentOnCard,
    "--school-primary-visible-card-light": schoolTheme.light.visibleSchoolColorOnCard,
    "--school-primary-visible-card-dark": schoolTheme.dark.visibleSchoolColorOnCard,
  } as KioskStyle;
  const cheerText = schoolMascot?.trim() ? `Go ${schoolMascot.trim()}!` : "Go Sundial!";

  const radius = 155;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(periodState.progressPercent, 100));
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (isNoSchool) {
    return (
      <KioskViewport style={kioskStyle}>
        <div className="flex h-full w-full items-center justify-center p-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
          <h1 className="text-[112px] font-extrabold">
            No School Today
          </h1>
          <p className="mt-6 text-[56px] text-slate-500">
            {noSchoolLabel}
          </p>
        </div></div>
      </KioskViewport>
    );
  }

  return (
    <KioskViewport style={kioskStyle}>
      <div className="flex h-full w-full flex-col px-6 pt-4">
        <header className="grid h-[120px] shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6">
          <div className="flex min-w-0 items-center gap-5">
            <SchoolLogo
              schoolName={schoolName}
              logoUrl={schoolLogoUrl}
              variant="kioskHeader"
              className="!h-[88px] !w-[88px] rounded-[14px]"
            />

            <div className="min-w-0">
              <h1 className="truncate text-[54px] font-extrabold leading-tight tracking-tight">
                {schoolName}
              </h1>

            </div>
          </div>
          <p className="whitespace-nowrap text-[22px] text-slate-500">{formatDateLabel(now, timeZone)}</p>
          <div className="grid min-w-[330px] shrink-0 grid-cols-[auto_64px] items-start justify-self-end gap-2 text-right">
            <div className="text-[82px] font-extrabold leading-none tracking-tight">
              {formatClock(now, timeZone).replace(" AM", "").replace(" PM", "")}
            </div>
            <div className="pt-1">
              <div className="text-[34px] font-bold leading-none">
                {getAmPm(now, timeZone)}
              </div>
              <div className="mt-2 text-[28px] font-semibold leading-none text-slate-500">
                {formatSeconds(now, timeZone)}
              </div>
            </div>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-[1.22fr_1fr] gap-5 pb-3">
          <div className="relative min-h-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
            <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_25%_45%,color-mix(in_srgb,var(--school-accent-visible-card)_14%,transparent),transparent_35%)]" />

            <div className="relative z-10 flex h-full flex-col items-center px-9 py-5">
              <p className="text-[25px] font-bold uppercase tracking-wide text-[var(--school-accent-visible-card)]">
                Current Period
              </p>

              <h2 className="mt-3 text-center text-[60px] font-extrabold leading-tight tracking-tight">
                {currentPeriodTitle}
              </h2>

              {currentPeriod && !scheduleNeedsTimes && (
                <p className="mt-1 text-[28px] text-slate-500">
                  {currentPeriod.startTime} – {currentPeriod.endTime}
                </p>
              )}

              {scheduleNeedsTimes ? (
                <div className="mt-12 max-w-[48rem] rounded-3xl bg-slate-50 px-14 py-10 text-center">
                  <p className="text-[28px] font-semibold text-slate-500">
                    Bell times have not been added yet.
                  </p>
                </div>
              ) : (
              <div className="relative isolate z-10 mt-4 h-[430px] w-[430px] shrink-0">
                <svg
                  className="h-full w-full -rotate-90"
                  viewBox="0 0 410 410"
                >
                  <circle
                    cx="205"
                    cy="205"
                    r={radius}
                    fill="none"
                    stroke="var(--kiosk-countdown-ring)"
                    strokeWidth="24"
                  />
                  <circle
                    cx="205"
                    cy="205"
                    r={radius}
                    fill="none"
                    stroke="var(--school-accent-visible-card)"
                    strokeWidth="24"
                    strokeLinecap="butt"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[20px] font-semibold uppercase tracking-wide text-slate-500">
                    {periodState.countdownLabel}
                  </p>
                  <p
                    className={[
                      "mt-3 max-w-[80%] text-center font-extrabold leading-none tracking-tight",
                      countdownIsLong
                        ? "text-[50px]"
                        : "text-[68px]",
                    ].join(" ")}
                  >
                    {periodState.countdown}
                  </p>
                </div>
              </div>
              )}

              <div className="mt-auto w-full border-t border-slate-200 pt-5">
                <div className="mx-auto grid max-w-[780px] grid-cols-[1fr_auto_1fr] items-center gap-8">
                  <div className="flex items-center justify-end gap-4">
                    <div className="flex h-[54px] w-[54px] min-w-[54px] items-center justify-center text-[var(--school-accent-visible-card)]">
                      <ClockIcon className="h-[32px] w-[32px]" />
                    </div>
                    <div>
                      <p className="text-[16px] font-semibold uppercase text-slate-500">
                        Next Period
                      </p>
                      <p className="text-[24px] font-extrabold">
                        {scheduleNeedsTimes ? "Bell times needed" : (nextPeriod?.name ?? "End of Day")}
                      </p>
                    </div>
                  </div>

                  <div className="h-[60px] w-px bg-slate-300" />

                  <div className="flex items-center gap-4">
                    <div className="flex h-[54px] w-[54px] min-w-[54px] items-center justify-center text-[var(--school-accent-visible-card)]">
                      <ScheduleDayIcon className="h-[32px] w-[32px]" />
                    </div>
                    <div>
                      <p className="text-[16px] font-semibold uppercase text-slate-500">
                        Day Type
                      </p>
                      <p className="text-[24px] font-extrabold">
                        {dayType}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 grid-rows-[390px_270px_174px] gap-5">
            <Card title="Today’s Schedule">
              <div
                className="grid min-h-0 flex-1 auto-rows-[40px] content-start gap-1 overflow-hidden"
              >
                {scheduleNeedsTimes ? (
                  <div className="flex h-full flex-col justify-center rounded-xl bg-slate-50 px-5 text-center">
                    <p className="text-[24px] font-extrabold">
                      {dayType}
                    </p>
                    <p className="mt-2 text-[18px] font-semibold text-slate-500">
                      Bell times have not been added yet.
                    </p>
                  </div>
                ) : (
                sortedPeriods.map((period) => {
                  const isCurrent = period.id === currentPeriod?.id;
                  const isComplete = periodState.completedPeriodIds.includes(period.id);

                  return (
                    <div
                      key={period.id}
                      className={[
                        "grid min-h-0 grid-cols-[minmax(150px,0.8fr)_minmax(210px,1fr)_40px] items-center gap-3 rounded-lg px-[18px] py-1 text-[18px] leading-tight",
                        isCurrent
                          ? "kiosk-current-period bg-[color-mix(in_srgb,var(--school-primary)_16%,white)] text-[var(--kiosk-text)]"
                          : "border-b border-slate-200",
                      ].join(" ")}
                    >
                      <div className="kiosk-current-period-name flex items-center gap-2 font-extrabold">
                        {isCurrent && (
                          <span className="kiosk-current-period-dot h-[10px] w-[10px] rounded-full bg-[var(--school-primary)]" />
                        )}
                        {period.name.replace(" Period", "")}
                      </div>

                      <div className="kiosk-current-period-time text-slate-600">
                        {period.startTime} – {period.endTime}
                      </div>

                      <div className="text-right text-[22px] font-bold text-green-500">
                        {isComplete && "✓"}
                      </div>
                    </div>
                  );
                })
                )}
              </div>
            </Card>

            <Card
              title={activeInfoCard === "events" ? "Upcoming Events" : "Today's Games"}
            >
              <div className="min-h-0 flex-1 overflow-hidden">
                <div
                  className={[
                    "grid h-full w-[200%] grid-cols-2 transition-transform duration-500 ease-in-out",
                    activeInfoCard === "events" ? "translate-x-0" : "-translate-x-1/2",
                  ].join(" ")}
                >
                  <div className="flex min-h-0 flex-col justify-center pr-3">
                {events.slice(0, 2).map((event) => (
                  <div
                    key={event.id}
                    className="flex min-h-0 items-center gap-5 border-b border-slate-200 py-2 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="shrink-0 text-[32px] leading-none text-[var(--school-accent-visible-card)]">
                      <CalendarStarIcon className="h-[26px] w-[26px]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[23px] font-extrabold leading-tight">
                        {event.title}
                      </p>
                      <p className="mt-1 text-[17px] font-semibold leading-tight text-[var(--school-accent-visible-card)]">
                        {event.date}
                      </p>
                    </div>
                  </div>
                ))}

                {events.length === 0 && (
                  <p className="text-[22px] font-semibold text-slate-500">
                    No Upcoming Events
                  </p>
                )}
                  </div>
                  <div className="flex min-h-0 flex-col justify-center pl-3">
                {games.slice(0, 3).map((game) => (
                  <div
                    key={game.id}
                    className="flex min-h-0 items-center gap-4 border-b border-slate-200 py-1.5 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div
                      className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl text-[16px] font-extrabold shadow-inner ring-1 ring-black/5"
                      style={getSportIconBadgeStyle(game.sportIconColor)}
                    >
                      <SportIcon
                        icon={game.sportIcon}
                        color={game.sportIconColor}
                        className="h-[24px] w-[24px]"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[20px] font-extrabold leading-tight">
                        {game.title}
                      </p>
                      <p className="mt-0.5 truncate text-[16px] font-semibold leading-tight text-slate-500">
                        {game.time} | {game.location}
                      </p>
                    </div>
                  </div>
                ))}

                {games.length > 3 && (
                  <Link
                    href={athleticsHref}
                    className="mt-1.5 text-[16px] font-extrabold text-[var(--school-accent-visible-card)]"
                  >
                    + {games.length - 3} more games today
                  </Link>
                )}

                {games.length === 0 && (
                  <p className="text-[22px] font-semibold text-slate-500">
                    No games today
                  </p>
                )}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex shrink-0 justify-center gap-2">
                {(["events", "games"] as const).map((card) => (
                  <button
                    key={card}
                    type="button"
                    aria-label={`Show ${card}`}
                    onClick={() => {
                      setActiveInfoCard(card);
                      setRotationReset((current) => current + 1);
                    }}
                    className={[
                      "h-[8px] w-[8px] rounded-full transition",
                      activeInfoCard === card ? "bg-[var(--school-accent-visible-card)]" : "bg-slate-300",
                    ].join(" ")}
                  />
                ))}
              </div>
            </Card>

            <Card title="Priority Announcement">
              <div className="flex min-w-0 items-center gap-5">
                <div className="text-[44px] text-[var(--school-accent-visible-card)]">
                  📣
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[25px] font-extrabold">
                    {announcement?.title ?? "No priority announcement"}
                  </p>
                  {announcement?.body && (
                    <p className="mt-1 line-clamp-2 text-[18px] text-slate-600">
                      {announcement.body}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </section>

        <footer className="-mx-6 flex h-[58px] shrink-0 items-center justify-center bg-[var(--school-primary)] text-[26px] font-extrabold text-[var(--kiosk-text)]">
          {cheerText}
        </footer>
      </div>
    </KioskViewport>
  );
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-4">
        <h3 className="text-[24px] font-extrabold uppercase tracking-wide text-[var(--school-accent-visible-card)]">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}
