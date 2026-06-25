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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const periodState = useMemo(() => getPeriodState(periods, now), [periods, now]);

  const currentPeriod = periodState.currentPeriod;
  const nextPeriod = periodState.nextPeriod;

  const radius = 155;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(periodState.progressPercent, 100));
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (isNoSchool) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[#f7f8fb] text-[#07152f]">
        <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
          <h1 className="text-7xl font-extrabold">No School Today</h1>
          <p className="mt-6 text-4xl text-slate-500">{noSchoolLabel}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#f7f8fb] text-[#07152f]">
      <div className="flex h-full w-full flex-col px-[2vw] py-[2vh]">
        <header className="flex h-[130px] items-start justify-between">
          <div className="flex items-center gap-6">
            {schoolLogoUrl && (
              <img
                src={schoolLogoUrl}
                alt={`${schoolName} logo`}
                className="h-24 w-24 object-contain"
              />
            )}

            <div>
              <h1 className="text-[clamp(2.5rem,4vw,5rem)] font-extrabold tracking-tight">
                {schoolName}
              </h1>
              <p className="mt-1 text-3xl text-slate-500">
                {formatDateLabel(now)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 text-right">
            <div className="text-[clamp(4rem,8vw,8rem)] font-extrabold leading-none tracking-tight">
              {formatClock(now).replace(" AM", "").replace(" PM", "")}
            </div>
            <div className="pt-4">
              <div className="text-5xl font-bold">{getAmPm(now)}</div>
              <div className="text-4xl font-semibold text-slate-500">
                {formatSeconds(now)}
              </div>
            </div>
          </div>
        </header>

        <section className="grid flex-1 grid-cols-[1.25fr_1fr] gap-5 pb-5">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_45%,rgba(245,158,11,0.10),transparent_35%)]" />

            <div className="relative flex h-full flex-col items-center px-10 py-8">
              <p className="text-2xl font-bold uppercase tracking-wide text-amber-500">
                Current Period
              </p>

              <h2 className="mt-6 text-[clamp(3rem,6vw,7rem)] font-extrabold tracking-tight">
                {currentPeriod?.name ?? "No Active Period"}
              </h2>

              {currentPeriod && (
                <p className="mt-3 text-3xl text-slate-500">
                  {currentPeriod.startTime} – {currentPeriod.endTime}
                </p>
              )}

              <div className="relative mt-8 h-[min(40vh,410px)] w-[min(40vh,410px)]">
                <svg className="h-full w-full -rotate-90">
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
                  <p className="text-xl font-semibold uppercase tracking-wide text-slate-500">
                    {periodState.countdownLabel}
                  </p>
                  <p className="mt-5 text-7xl font-extrabold tracking-tight">
                    {periodState.countdown}
                  </p>
                </div>
              </div>

              <div className="mt-auto w-full border-t border-slate-200 pt-8">
                <div className="mx-auto grid max-w-[720px] grid-cols-[1fr_auto_1fr] items-center gap-10">
                  <div className="flex items-center justify-end gap-5">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-amber-400 text-3xl">
                      ◷
                    </div>
                    <div>
                      <p className="text-lg font-semibold uppercase text-slate-500">
                        Next Period
                      </p>
                      <p className="text-3xl font-extrabold">
                        {nextPeriod?.name ?? "End of Day"}
                      </p>
                    </div>
                  </div>

                  <div className="h-20 w-px bg-slate-300" />

                  <div className="flex items-center gap-5">
                    <div className="flex h-16 w-16 items-center justify-center text-5xl text-amber-500">
                      ▦
                    </div>
                    <div>
                      <p className="text-lg font-semibold uppercase text-slate-500">
                        Day Type
                      </p>
                      <p className="text-3xl font-extrabold">{dayType}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-rows-[1.5fr_0.85fr_0.75fr] gap-5">
            <Card title="Today’s Schedule">
              <div className="space-y-2">
                {periods.map((period) => {
                  const isCurrent = period.id === currentPeriod?.id;

                  return (
                    <div
                      key={period.id}
                      className={[
                        "grid grid-cols-[70px_1fr_60px] items-center rounded-xl px-6 py-4 text-2xl",
                        isCurrent
                          ? "bg-amber-100 text-[#07152f]"
                          : "border-b border-slate-200",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-4 font-extrabold">
                        {isCurrent && (
                          <span className="h-4 w-4 rounded-full bg-amber-400" />
                        )}
                        {period.name.replace(" Period", "")}
                      </div>

                      <div className="text-slate-600">
                        {period.startTime} – {period.endTime}
                      </div>

                      <div className="text-right text-3xl font-bold text-green-500">
                        {!isCurrent && "✓"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Upcoming Events">
              <div className="space-y-5">
                {events.slice(0, 2).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-6 border-b border-slate-200 pb-5 last:border-b-0"
                  >
                    <div className="text-5xl text-amber-500">▦</div>
                    <div>
                      <p className="text-3xl font-extrabold">{event.title}</p>
                      <p className="text-2xl font-semibold text-amber-500">
                        {event.date}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Priority Announcement">
              <div className="flex items-center gap-7">
                <div className="text-6xl text-amber-500">📣</div>
                <div>
                  <p className="text-3xl font-extrabold">
                    {announcement?.title ?? "No priority announcement"}
                  </p>
                  {announcement?.body && (
                    <p className="mt-2 text-2xl text-slate-600">
                      {announcement.body}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </section>

        <footer className="-mx-8 -mb-6 flex h-[6vh] items-center justify-center bg-gradient-to-r from-amber-300 to-amber-400 text-3xl font-extrabold">
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
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
      <h3 className="mb-6 text-2xl font-extrabold uppercase tracking-wide text-amber-500">
        {title}
      </h3>
      {children}
    </div>
  );
}