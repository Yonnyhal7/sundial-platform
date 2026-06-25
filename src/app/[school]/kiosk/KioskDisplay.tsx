"use client";

import { useEffect, useMemo, useState } from "react";

type Period = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  rawStartTime: string;
  rawEndTime: string;
};

type EventItem = {
  id: string;
  title: string;
  date: string;
};

type Announcement = {
  title: string;
  body: string;
};

type KioskDisplayProps = {
  schoolName: string;
  schoolLogoUrl?: string;
  dayType: string;
  periods: Period[];
  events: EventItem[];
  announcement?: Announcement | null;
  isNoSchool?: boolean;
  noSchoolLabel?: string;
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

function timeToDate(time: string, baseDate: Date) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(baseDate);

  date.setHours(hours, minutes, 0, 0);

  return date;
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getPeriodState(periods: Period[], now: Date) {
  let currentPeriod: Period | null = null;
  let nextPeriod: Period | null = null;
  let countdownLabel: "TIME REMAINING" | "STARTS IN" = "TIME REMAINING";
  let countdown = "0:00";
  let progressPercent = 0;

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const start = timeToDate(period.rawStartTime, now);
    const end = timeToDate(period.rawEndTime, now);

    if (now >= start && now <= end) {
      currentPeriod = period;
      nextPeriod = periods[i + 1] ?? null;
      countdownLabel = "TIME REMAINING";
      countdown = formatCountdown(end.getTime() - now.getTime());

      const total = end.getTime() - start.getTime();
      const elapsed = now.getTime() - start.getTime();

      progressPercent = total > 0 ? (elapsed / total) * 100 : 0;

      return {
        currentPeriod,
        nextPeriod,
        countdownLabel,
        countdown,
        progressPercent,
      };
    }

    if (now < start) {
      currentPeriod = period;
      nextPeriod = period;
      countdownLabel = "STARTS IN";
      countdown = formatCountdown(start.getTime() - now.getTime());
      progressPercent = 0;

      return {
        currentPeriod,
        nextPeriod,
        countdownLabel,
        countdown,
        progressPercent,
      };
    }
  }

  return {
    currentPeriod,
    nextPeriod,
    countdownLabel,
    countdown,
    progressPercent,
  };
}

export default function KioskDisplay({
  schoolName,
  schoolLogoUrl,
  dayType,
  periods,
  events,
  announcement,
  isNoSchool = false,
  noSchoolLabel = "Enjoy your day",
}: KioskDisplayProps) {
  const [now, setNow] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setNow(new Date());

    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    handleFullscreenChange();

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  async function enterFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  }

  const periodState = useMemo(() => {
    if (!now) {
      return {
        currentPeriod: null,
        nextPeriod: null,
        countdownLabel: "TIME REMAINING" as const,
        countdown: "0:00",
        progressPercent: 0,
      };
    }

    return getPeriodState(periods, now);
  }, [periods, now]);

  if (!now) {
    return null;
  }

  const currentPeriod = periodState.currentPeriod;
  const nextPeriod = periodState.nextPeriod;

  const radius = 155;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(periodState.progressPercent, 100));
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (isNoSchool) {
    return (
      <main className="flex h-[99dvh] w-screen items-center justify-center bg-[#f7f8fb] p-6 text-[#07152f]">
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
          <h1 className="text-[clamp(3rem,7vw,7rem)] font-extrabold">
            No School Today
          </h1>
          <p className="mt-6 text-[clamp(1.5rem,3vw,4rem)] text-slate-500">
            {noSchoolLabel}
          </p>
        </div>

        {!isFullscreen && (
          <button
            onClick={enterFullscreen}
            className="fixed bottom-6 right-6 z-50 rounded-2xl bg-amber-400 px-5 py-3 text-sm font-bold text-[#07152f] shadow-lg transition hover:bg-amber-300"
          >
            Enter Full Screen
          </button>
        )}
      </main>
    );
  }

  return (
    <main className="h-[99dvh] w-screen overflow-hidden bg-[#f7f8fb] text-[#07152f]">
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
                {currentPeriod?.name ?? "No Active Period"}
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
                  <p className="mt-[1.1dvh] text-[clamp(2.75rem,4.2vw,5rem)] font-extrabold leading-none tracking-tight">
                    {periodState.countdown}
                  </p>
                </div>
              </div>

              <div className="mt-auto w-full border-t border-slate-200 pt-[1.8dvh]">
                <div className="mx-auto grid max-w-[760px] grid-cols-[1fr_auto_1fr] items-center gap-[1.8vw]">
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

              {!isFullscreen && (
                <button
                  onClick={enterFullscreen}
                  className="fixed bottom-6 right-6 z-50 rounded-2xl bg-amber-400 px-5 py-3 text-sm font-bold text-[#07152f] shadow-lg transition hover:bg-amber-300"
                >
                  Enter Full Screen
                </button>
              )}
            </div>
          </div>

          <div className="grid min-h-0 grid-rows-[1.5fr_0.9fr_0.8fr] gap-[1vw]">
            <Card title="Today’s Schedule">
              <div className="space-y-[0.25dvh]">
                {periods.map((period) => {
                  const isCurrent = period.id === currentPeriod?.id;

                  return (
                    <div
                      key={period.id}
                      className={[
                        "grid grid-cols-[3.4vw_1fr_2.4vw] items-center rounded-xl px-[1.2vw] py-[0.8dvh] text-[clamp(0.8rem,1.05vw,1.25rem)]",
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

                      <div className="text-right text-[clamp(0.95rem,1.4vw,1.6rem)] font-bold text-green-500">
                        {!isCurrent && "✓"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Upcoming Events">
              <div className="space-y-[0.9dvh]">
                {events.slice(0, 2).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-[1vw] border-b border-slate-200 pb-[0.9dvh] last:border-b-0"
                  >
                    <div className="text-[clamp(1.4rem,2.2vw,2.7rem)] text-amber-500">
                      ▦
                    </div>
                    <div>
                      <p className="text-[clamp(0.95rem,1.35vw,1.65rem)] font-extrabold">
                        {event.title}
                      </p>
                      <p className="text-[clamp(0.8rem,1.05vw,1.2rem)] font-semibold text-amber-500">
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
          Go Eagles!
        </footer>
      </div>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-[1.45vw] shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
      <h3 className="mb-[0.9dvh] text-[clamp(0.95rem,1.3vw,1.55rem)] font-extrabold uppercase tracking-wide text-amber-500">
        {title}
      </h3>
      {children}
    </div>
  );
}