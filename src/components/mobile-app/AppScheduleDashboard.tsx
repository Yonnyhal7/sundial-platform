"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckIcon } from "@/components/mobile-app/AppIcons";
import {
  formatCountdownDuration,
  formatPeriodTime,
  getTodayScheduleState,
  type SchedulePeriod,
  sortPeriodsByScheduleOrder,
} from "@/lib/scheduleTime";

type AppScheduleDashboardProps = {
  school: string;
  periods: SchedulePeriod[];
  todayScheduleLabel: string;
  noSchool?: boolean;
};

export default function AppScheduleDashboard({
  school,
  periods,
  todayScheduleLabel,
  noSchool = false,
}: AppScheduleDashboardProps) {
  const [now, setNow] = useState<Date | null>(null);

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

  const sortedPeriods = useMemo(
    () => sortPeriodsByScheduleOrder(periods),
    [periods]
  );

  const scheduleState = useMemo(() => {
    if (!now || noSchool) {
      return getTodayScheduleState([], new Date());
    }

    return getTodayScheduleState(sortedPeriods, now);
  }, [noSchool, now, sortedPeriods]);

  const countdown = scheduleState.countdownTarget && now
    ? formatCountdownDuration(scheduleState.countdownTarget.getTime() - now.getTime())
    : "Done";
  const activePeriod = scheduleState.currentPeriod;
  const ringProgress = Math.max(0, Math.min(scheduleState.progressPercent, 100));
  const background = `conic-gradient(var(--school-accent-visible-card) ${ringProgress}%, #e6e8ee ${ringProgress}% 100%)`;
  const currentTitle = noSchool
    ? "No School"
    : scheduleState.status === "after_school"
      ? "School Day Complete"
      : activePeriod?.name || "No Active Period";
  const nextPeriodLabel = scheduleState.status === "after_school"
    ? "End of Day"
    : scheduleState.nextPeriod?.name || "End of Day";

  return (
    <>
      <section className="rounded-[clamp(1.1rem,3.2vw,1.75rem)] border border-slate-200 bg-white px-[clamp(1rem,4vw,1.5rem)] py-[clamp(1.25rem,4.5vw,2rem)] text-center shadow-[0_12px_32px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424]">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--school-accent-visible-card)]">
          Current Period
        </p>
        <h2 className="mt-4 text-[clamp(1.35rem,4vw,2rem)] font-black leading-tight tracking-tight text-slate-950 dark:text-white">
          {currentTitle}
        </h2>
        {activePeriod && (
          <p className="mt-4 text-[clamp(0.95rem,2.2vw,1.1rem)] font-semibold text-slate-500 dark:text-[#a3a3a3]">
            {formatPeriodTime(activePeriod.start_time)} -{" "}
            {formatPeriodTime(activePeriod.end_time)}
          </p>
        )}

        <div className="mt-[clamp(1.25rem,3.5vw,1.75rem)] flex justify-center">
          <div
            className="grid h-[clamp(10rem,38vw,12.5rem)] w-[clamp(10rem,38vw,12.5rem)] place-items-center rounded-full p-[clamp(0.7rem,2.3vw,0.85rem)]"
            style={{ background }}
          >
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center dark:bg-[#242424]">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-[#a3a3a3]">
                {scheduleState.countdownLabel}
              </p>
              <p className="mt-3 text-[clamp(1.5rem,5vw,2.35rem)] font-black leading-none tracking-tight text-slate-950 dark:text-white">
                {countdown}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-[clamp(1.5rem,4vw,2rem)] border-t border-slate-200 pt-[clamp(1.25rem,3.5vw,1.5rem)] dark:border-[#3a3a3a]">
          <div className="mx-auto grid max-w-[clamp(20rem,78vw,32.5rem)] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[clamp(1rem,3.4vw,1.75rem)] text-left sm:gap-20">
            <div className="flex min-w-0 items-center justify-end gap-[clamp(0.5rem,1.8vw,0.75rem)]">
              <div className="grid h-[clamp(2.25rem,5.5vw,2.75rem)] w-[clamp(2.25rem,5.5vw,2.75rem)] shrink-0 place-items-center rounded-full border-2 border-[var(--school-accent-visible-card)] text-[var(--school-accent-visible-card)]">
                <SmallClockIcon className="h-[clamp(0.9rem,2.3vw,1.25rem)] w-[clamp(0.9rem,2.3vw,1.25rem)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-[#a3a3a3]">
                  Next Period
                </p>
                <p className="text-[10px] mt-1 truncate text-base font-black leading-tight text-slate-950 dark:text-white">
                  {noSchool ? "No School" : nextPeriodLabel}
                </p>
              </div>
            </div>

            <div className="h-12 w-px bg-slate-300 dark:bg-[#3a3a3a]" />

            <div className="flex min-w-0 items-center gap-[clamp(0.25rem,0.8vw,0.5rem)]">
              <div className="grid h-[clamp(2.25rem,5.5vw,2.75rem)] w-[clamp(2.25rem,5.5vw,2.75rem)] shrink-0 place-items-center text-[var(--school-accent-visible-card)]">
                <SmallCalendarIcon className="h-[clamp(1rem,2.5vw,1.25rem)] w-[clamp(1rem,2.5vw,1.25rem)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-[#a3a3a3]">
                  Day Type
                </p>
                <p className="text-[10px] mt-0 text-sm font-black leading-tight text-slate-950 dark:text-white">
                  {todayScheduleLabel}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[clamp(1.1rem,3.2vw,1.75rem)] border border-slate-200 bg-white shadow-[0_12px_32px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424]">
        <div className="px-[clamp(0.9rem,3.6vw,1.5rem)] py-[clamp(0.9rem,2.6vw,1.25rem)]">
          <h2 className="min-w-0 text-[clamp(0.9rem,2.2vw,1.1rem)] font-black uppercase tracking-wide text-slate-500 dark:text-[#a3a3a3] break-words whitespace-normal">
            Today&apos;s Schedule
          </h2>
        </div>
        {sortedPeriods.length === 0 || noSchool ? (
          <p className="mx-[clamp(1rem,4vw,1.5rem)] mb-[clamp(1rem,3vw,1.5rem)] rounded-[clamp(1rem,2.8vw,1.25rem)] bg-slate-50 p-[clamp(0.9rem,2.6vw,1rem)] text-sm font-medium text-slate-500 dark:bg-[#181818] dark:text-[#a3a3a3]">
            No periods are scheduled for today.
          </p>
        ) : (
          <div>
            {sortedPeriods.map((period) => {
              const complete = scheduleState.completedPeriodIds.includes(period.id);
              const current = activePeriod?.id === period.id && scheduleState.status !== "after_school";
              const indicator = getPeriodIndicator(period.name);

              return (
                <div
                  key={period.id}
                  className={`grid grid-cols-[clamp(3rem,7vw,3.5rem)_minmax(0,1fr)_auto_auto] items-center gap-[clamp(0.75rem,2.2vw,1rem)] border-t border-slate-200 px-[clamp(1rem,4vw,1.25rem)] py-[clamp(0.9rem,2.8vw,1rem)] transition dark:border-[#3a3a3a] ${
                    current
                      ? "bg-[color-mix(in_srgb,var(--school-primary)_16%,white)] dark:bg-[color-mix(in_srgb,var(--school-primary)_20%,#242424)]"
                      : "bg-white dark:bg-[#242424]"
                  }`}
                >
                  <div
                    className={`grid h-[clamp(2.5rem,6vw,3rem)] w-[clamp(2.5rem,6vw,3rem)] place-items-center rounded-full border text-[clamp(0.95rem,2.4vw,1.1rem)] font-black ${
                      complete
                        ? "border-[color-mix(in_srgb,var(--school-accent-visible-card)_45%,white)] text-[var(--school-accent-visible-card)]"
                        : current
                          ? "border-[var(--school-primary)] text-[var(--school-primary)]"
                          : "border-slate-300 text-slate-500 dark:border-[#4a4a4a] dark:text-[#a3a3a3]"
                    }`}
                  >
                    {complete ? (
                      <CheckIcon className="h-6 w-6" />
                    ) : (
                      indicator
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[clamp(0.95rem,2.4vw,1.1rem)] font-black leading-tight text-slate-950 dark:text-white">
                      {period.name}
                    </p>
                    <p className="mt-1 text-[clamp(0.85rem,2.1vw,1rem)] font-semibold leading-tight text-slate-500 dark:text-[#a3a3a3]">
                      {formatPeriodTime(period.start_time)} -{" "}
                      {formatPeriodTime(period.end_time)}
                    </p>
                  </div>

                  {current && (
                    <span className="rounded-full bg-[var(--school-primary)] px-3 py-1 text-xs font-black uppercase text-[var(--school-primary-text)]">
                      Current
                    </span>
                  )}
                  {!current && <span />}

                  <ChevronRightIcon className="h-[clamp(1.1rem,2.8vw,1.5rem)] w-[clamp(1.1rem,2.8vw,1.5rem)] text-slate-950 dark:text-white" />
                </div>
              );
            })}
          </div>
        )}

        <div className="px-[clamp(0.9rem,3.6vw,1.5rem)] py-[clamp(0.75rem,2vw,1rem)]">
          <Link
            href={`/${school}/app/schedule`}
            className="inline-flex items-center gap-[clamp(0.25rem,0.8vw,0.5rem)] text-[clamp(0.8rem,1.9vw,0.95rem)] font-black uppercase text-[var(--school-primary)]"
            aria-label="View full schedule"
          >
            View Full Schedule
            <ChevronRightIcon className="h-[clamp(0.9rem,2.4vw,1.25rem)] w-[clamp(0.9rem,2.4vw,1.25rem)]" />
          </Link>
        </div>
      </section>
    </>
  );
}

function getPeriodIndicator(name: string) {
  if (name.toLowerCase().includes("lunch")) {
    return "L";
  }

  const match = name.match(/\d+/);

  return match?.[0] || name.slice(0, 1).toUpperCase();
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m9 5 7 7-7 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SmallClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SmallCalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 4.5h14v15H5v-15Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 3v4M16 3v4M5 9h14M9 13h.01M12 13h.01M15 13h.01M9 16h.01M12 16h.01M15 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
