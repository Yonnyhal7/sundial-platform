"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import SportIcon from "@/components/SportIcon";
import {
  formatCountdownDuration,
  getTodayScheduleState,
  sortPeriodsByScheduleOrder,
  type SchedulePeriod,
} from "@/lib/scheduleTime";

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
  schoolLogoUrl?: string;
  dayType: string;
  periods: Period[];
  events: EventItem[];
  games: GameItem[];
  athleticsHref: string;
  announcement?: Announcement | null;
  isNoSchool?: boolean;
  noSchoolLabel?: string;
};

type KioskStyle = CSSProperties & {
  "--school-primary": string;
};

function formatClock(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatSeconds(date: Date) {
  return `:${date.getSeconds().toString().padStart(2, "0")}`;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getAmPm(date: Date) {
  return date.getHours() >= 12 ? "PM" : "AM";
}

export default function KioskDisplay({
  schoolName,
  schoolPrimaryColor,
  schoolLogoUrl,
  dayType,
  periods,
  events,
  games,
  athleticsHref,
  announcement,
  isNoSchool = false,
  noSchoolLabel = "Enjoy your day",
}: KioskDisplayProps) {
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

    const state = getTodayScheduleState(schedulePeriods, now);
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
  }, [now, schedulePeriods, sortedPeriods]);

  if (!now) {
    return null;
  }

  const currentPeriod = periodState.currentPeriod;
  const nextPeriod = periodState.nextPeriod;
  const currentPeriodTitle = periodState.isDayComplete
    ? "School Day Complete"
    : currentPeriod?.name ?? "No Active Period";
  const countdownIsLong = periodState.countdown.includes("hr");

  const radius = 155;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(periodState.progressPercent, 100));
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (isNoSchool) {
    return (
      <main
        className="kiosk-theme flex h-[99dvh] w-screen items-center justify-center bg-[#f7f8fb] p-6 text-[#07152f]"
        style={{ "--school-primary": schoolPrimaryColor } as KioskStyle}
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
          <h1 className="text-[clamp(3rem,7vw,7rem)] font-extrabold">
            No School Today
          </h1>
          <p className="mt-6 text-[clamp(1.5rem,3vw,4rem)] text-slate-500">
            {noSchoolLabel}
          </p>
        </div>

      </main>
    );
  }

  return (
    <main
      className="kiosk-theme h-[99dvh] w-screen overflow-hidden bg-[#f7f8fb] text-[#07152f]"
      style={{ "--school-primary": schoolPrimaryColor } as KioskStyle}
    >
      <div className="flex h-full w-full flex-col px-[1.25vw] py-[1dvh]">
        <header className="grid h-[11dvh] shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-[1vw]">
          <div className="flex min-w-0 items-center gap-[1vw]">
            {schoolLogoUrl && (
              <img
                src={schoolLogoUrl}
                alt={`${schoolName} logo`}
                className="h-[7dvh] w-[7dvh] shrink-0 object-contain"
              />
            )}

            <div className="flex min-w-0 items-end gap-[15vw]">
              <h1 className="truncate text-[clamp(1.8rem,3vw,3.75rem)] font-extrabold leading-[1.25] tracking-tight">
                {schoolName}
              </h1>

              <p className="ml-[2vw] mb-[0.6dvh] whitespace-nowrap text-[clamp(0.9rem,1.15vw,1.35rem)] text-slate-500">
                {formatDateLabel(now)}
              </p>
            </div>
            </div>
          <div className="flex shrink-0 items-start gap-[0.45vw] text-right">
            <div className="text-[clamp(2.8rem,4.8vw,5rem)] font-extrabold leading-none tracking-tight">
              {formatClock(now).replace(" AM", "").replace(" PM", "")}
            </div>
            <div className="pt-[0.35dvh]">
              <div className="text-[clamp(1.25rem,1.9vw,2.25rem)] font-bold leading-none">
                {getAmPm(now)}
              </div>
              <div className="mt-[0.4dvh] text-[clamp(1rem,1.45vw,1.75rem)] font-semibold leading-none text-slate-500">
                {formatSeconds(now)}
              </div>
            </div>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-[1vw] pb-[1dvh] lg:grid-cols-[1.22fr_1fr]">
          <div className="relative min-h-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_45%,rgba(245,158,11,0.10),transparent_35%)]" />

            <div className="relative flex h-full flex-col items-center px-[1.75vw] py-[1.8dvh]">
              <p className="text-[clamp(0.95rem,1.35vw,1.55rem)] font-bold uppercase tracking-wide text-amber-500">
                Current Period
              </p>

              <h2 className="mt-[1.6dvh] text-center text-[clamp(2.5rem,4vw,5rem)] font-extrabold leading-tight tracking-tight">
                {currentPeriodTitle}
              </h2>

              {currentPeriod && (
                <p className="mt-[0.6dvh] text-[clamp(1rem,1.55vw,1.75rem)] text-slate-500">
                  {currentPeriod.startTime} – {currentPeriod.endTime}
                </p>
              )}

              <div className="relative mt-[2dvh] h-[min(45dvh,450px)] w-[min(45dvh,450px)]">
                <svg
                  className="h-full w-full -rotate-90"
                  viewBox="0 0 410 410"
                >
                  <circle
                    cx="205"
                    cy="205"
                    r={radius}
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="24"
                  />
                  <circle
                    cx="205"
                    cy="205"
                    r={radius}
                    fill="none"
                    stroke="#f5b400"
                    strokeWidth="24"
                    strokeLinecap="butt"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[clamp(0.85rem,1.15vw,1.25rem)] font-semibold uppercase tracking-wide text-slate-500">
                    {periodState.countdownLabel}
                  </p>
                  <p
                    className={[
                      "mt-[1.1dvh] max-w-[82%] text-center font-extrabold leading-none tracking-tight",
                      countdownIsLong
                        ? "text-[clamp(2rem,2.7vw,3.4rem)]"
                        : "text-[clamp(2.75rem,4.2vw,5rem)]",
                    ].join(" ")}
                  >
                    {periodState.countdown}
                  </p>
                </div>
              </div>

              <div className="mt-auto w-full border-t border-slate-200 pt-[1.8dvh]">
                <div className="mx-auto grid max-w-[780px] grid-cols-[1fr_auto_1fr] items-center gap-[1.8vw]">
                  <div className="flex items-center justify-end gap-[0.9vw]">
                    <div className="flex h-[5dvh] w-[5dvh] min-w-[5dvh] items-center justify-center rounded-full border-[0.25dvh] border-amber-400 text-[1.8dvh]">
                      ◷
                    </div>
                    <div>
                      <p className="text-[clamp(0.7rem,0.9vw,1rem)] font-semibold uppercase text-slate-500">
                        Next Period
                      </p>
                      <p className="text-[clamp(0.95rem,1.35vw,1.6rem)] font-extrabold">
                        {nextPeriod?.name ?? "End of Day"}
                      </p>
                    </div>
                  </div>

                  <div className="h-[5.5dvh] w-px bg-slate-300" />

                  <div className="flex items-center gap-[0.9vw]">
                    <div className="flex h-[5dvh] w-[5dvh] min-w-[5dvh] items-center justify-center text-[3dvh] text-amber-500">
                      ▦
                    </div>
                    <div>
                      <p className="text-[clamp(0.7rem,0.9vw,1rem)] font-semibold uppercase text-slate-500">
                        Day Type
                      </p>
                      <p className="text-[clamp(0.95rem,1.35vw,1.6rem)] font-extrabold">
                        {dayType}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 grid-rows-[1.35fr_1.05fr_0.8fr] gap-[1vw]">
            <Card title="Today’s Schedule">
              <div
                className="grid min-h-0 flex-1 gap-[0.25dvh]"
                style={{
                  gridTemplateRows: `repeat(${Math.max(sortedPeriods.length, 1)}, minmax(0, 1fr))`,
                }}
              >
                {sortedPeriods.map((period) => {
                  const isCurrent = period.id === currentPeriod?.id;
                  const isComplete = periodState.completedPeriodIds.includes(period.id);

                  return (
                    <div
                      key={period.id}
                      className={[
                        "grid min-h-0 grid-cols-[minmax(5.6rem,0.8fr)_minmax(7.5rem,1fr)_2rem] items-center gap-[0.6vw] rounded-lg px-[0.9vw] py-[0.35dvh] text-[clamp(0.72rem,0.92vw,1.08rem)] leading-tight",
                        isCurrent
                          ? "bg-amber-100 text-[#07152f]"
                          : "border-b border-slate-200",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-[0.5vw] font-extrabold">
                        {isCurrent && (
                          <span className="h-[0.55vw] w-[0.55vw] rounded-full bg-amber-400" />
                        )}
                        {period.name.replace(" Period", "")}
                      </div>

                      <div className="text-slate-600">
                        {period.startTime} – {period.endTime}
                      </div>

                      <div className="text-right text-[clamp(0.85rem,1.1vw,1.35rem)] font-bold text-green-500">
                        {isComplete && "✓"}
                      </div>
                    </div>
                  );
                })}
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
                  <div className="flex min-h-0 flex-col justify-center pr-[0.6vw]">
                {events.slice(0, 2).map((event) => (
                  <div
                    key={event.id}
                    className="flex min-h-0 items-center gap-[1vw] border-b border-slate-200 py-[0.85dvh] first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="shrink-0 text-[clamp(1.25rem,1.9vw,2.25rem)] leading-none text-amber-500">
                      ▦
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[clamp(0.95rem,1.28vw,1.5rem)] font-extrabold leading-tight">
                        {event.title}
                      </p>
                      <p className="mt-[0.25dvh] text-[clamp(0.75rem,0.98vw,1.1rem)] font-semibold leading-tight text-amber-500">
                        {event.date}
                      </p>
                    </div>
                  </div>
                ))}

                {events.length === 0 && (
                  <p className="text-[clamp(0.95rem,1.25vw,1.5rem)] font-semibold text-slate-500">
                    No Upcoming Events
                  </p>
                )}
                  </div>
                  <div className="flex min-h-0 flex-col justify-center pl-[0.6vw]">
                {games.slice(0, 3).map((game) => (
                  <div
                    key={game.id}
                    className="flex min-h-0 items-center gap-[0.8vw] border-b border-slate-200 py-[0.55dvh] first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="grid h-[3.8dvh] w-[3.8dvh] shrink-0 place-items-center rounded-xl bg-amber-100 text-[clamp(0.65rem,0.85vw,1rem)] font-extrabold text-amber-500">
                      <SportIcon
                        icon={game.sportIcon}
                        color={game.sportIconColor}
                        className="h-[2dvh] w-[2dvh]"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[clamp(0.85rem,1.08vw,1.25rem)] font-extrabold leading-tight">
                        {game.title}
                      </p>
                      <p className="mt-[0.15dvh] truncate text-[clamp(0.68rem,0.85vw,0.98rem)] font-semibold leading-tight text-slate-500">
                        {game.time} | {game.location}
                      </p>
                    </div>
                  </div>
                ))}

                {games.length > 3 && (
                  <Link
                    href={athleticsHref}
                    className="mt-[0.55dvh] text-[clamp(0.7rem,0.85vw,0.95rem)] font-extrabold text-amber-500"
                  >
                    + {games.length - 3} more games today
                  </Link>
                )}

                {games.length === 0 && (
                  <p className="text-[clamp(0.95rem,1.25vw,1.5rem)] font-semibold text-slate-500">
                    No games today
                  </p>
                )}
                  </div>
                </div>
              </div>
              <div className="mt-[0.65dvh] flex shrink-0 justify-center gap-[0.35vw]">
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
                      "h-[0.75dvh] w-[0.75dvh] rounded-full transition",
                      activeInfoCard === card ? "bg-amber-500" : "bg-slate-300",
                    ].join(" ")}
                  />
                ))}
              </div>
            </Card>

            <Card title="Priority Announcement">
              <div className="flex items-center gap-[1vw]">
                <div className="text-[clamp(1.8rem,2.8vw,3.25rem)] text-amber-500">
                  📣
                </div>
                <div>
                  <p className="text-[clamp(0.95rem,1.35vw,1.65rem)] font-extrabold">
                    {announcement?.title ?? "No priority announcement"}
                  </p>
                  {announcement?.body && (
                    <p className="mt-[0.35dvh] text-[clamp(0.8rem,0.95vw,1.15rem)] text-slate-600">
                      {announcement.body}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </section>

        <footer className="-mx-[1.25vw] -mb-[1dvh] flex h-[5.25dvh] shrink-0 items-center justify-center bg-gradient-to-r from-amber-300 to-amber-400 text-[clamp(1rem,1.35vw,1.55rem)] font-extrabold">
          Go Suns!
        </footer>
      </div>
    </main>
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
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-[1.2vw] shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
      <div className="mb-[0.9dvh] flex shrink-0 items-center justify-between gap-[1vw]">
        <h3 className="text-[clamp(0.95rem,1.3vw,1.55rem)] font-extrabold uppercase tracking-wide text-amber-500">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}
