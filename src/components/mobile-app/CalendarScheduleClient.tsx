"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckIcon } from "@/components/mobile-app/AppIcons";
import {
  formatPeriodTime,
  getTodayScheduleState,
  type SchedulePeriod,
} from "@/lib/scheduleTime";

export type CalendarScheduleDay = {
  date: string;
  dayNumber: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  weekdayLabel: string;
  longDateLabel: string;
  isSchoolDay: boolean | null;
  scheduleName: string | null;
  scheduleType: string | null;
  scheduleSetupStatus: string | null;
  label: string | null;
  periods: SchedulePeriod[];
};

type CalendarScheduleClientProps = {
  monthLabel: string;
  previousMonthHref: string;
  nextMonthHref: string;
  today: string;
  days: CalendarScheduleDay[];
};

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarScheduleClient({
  monthLabel,
  previousMonthHref,
  nextMonthHref,
  today,
  days,
}: CalendarScheduleClientProps) {
  const defaultSelectedDate =
    days.find((day) => day.date === today)?.date ||
    days.find((day) => day.inCurrentMonth)?.date ||
    days[0]?.date ||
    today;
  const [selectedDate, setSelectedDate] = useState(defaultSelectedDate);
  const [now, setNow] = useState<Date | null>(null);
  const selectedDay =
    days.find((day) => day.date === selectedDate) ||
    days.find((day) => day.date === today) ||
    days[0];

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

  const selectedIsToday = selectedDay?.date === today;
  const scheduleState = useMemo(() => {
    if (!selectedIsToday || !now || !selectedDay) {
      return getTodayScheduleState([], new Date());
    }

    return getTodayScheduleState(selectedDay.periods, now, {
      needsTimes: selectedDay.scheduleSetupStatus === "needs_times",
    });
  }, [now, selectedDay, selectedIsToday]);

  function selectDate(date: string) {
    setSelectedDate(date);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424]">
        <div className="mb-3 grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
          <Link
            href={previousMonthHref}
            aria-label="Previous month"
            className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-[#181818] dark:text-[#d4d4d4] dark:hover:bg-[#202020]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>

          <h2 className="text-center text-xl font-black text-slate-950 dark:text-white">
            {monthLabel}
          </h2>

          <Link
            href={nextMonthHref}
            aria-label="Next month"
            className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-[#181818] dark:text-[#d4d4d4] dark:hover:bg-[#202020]"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-1 pb-1">
          {weekDays.map((day) => (
            <div
              key={day}
              className="py-1 text-center text-[11px] font-black uppercase tracking-wide text-slate-400"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const selected = day.date === selectedDate;
            const indicator = getScheduleIndicator(day);

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => selectDate(day.date)}
                className={`relative aspect-square rounded-2xl border p-1 text-center transition ${
                  selected
                    ? "border-[var(--school-primary)] bg-white shadow-sm dark:bg-[#242424]"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-[#3a3a3a] dark:bg-[#181818] dark:hover:bg-[#202020]"
                } ${day.inCurrentMonth ? "" : "opacity-45"}`}
              >
                <span
                  className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-sm font-black ${
                    day.isToday
                      ? "bg-[var(--school-primary)] text-white"
                      : selected
                        ? "text-[var(--school-primary)]"
                        : "text-slate-700 dark:text-[#d4d4d4]"
                  }`}
                >
                  {day.dayNumber}
                </span>

                {indicator && (
                  <span
                    className={`absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${indicator}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {selectedDay && (
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424]">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--school-primary)]">
              {selectedDay.weekdayLabel}
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              {selectedDay.longDateLabel}
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
              {getSelectedDaySummary(selectedDay)}
            </p>
          </div>

          {selectedDay.isSchoolDay === false ? (
            <EmptyScheduleMessage title="No School" body={selectedDay.label || "Enjoy your day."} />
          ) : !selectedDay.scheduleName ? (
            <EmptyScheduleMessage
              title="No schedule assigned"
              body="A bell schedule has not been assigned for this date yet."
            />
          ) : selectedDay.scheduleSetupStatus === "needs_times" ? (
            <EmptyScheduleMessage
              title={selectedDay.scheduleName}
              body="Bell times have not been added yet."
            />
          ) : selectedDay.periods.length === 0 ? (
            <EmptyScheduleMessage
              title="No periods added"
              body="This schedule does not have periods listed yet."
            />
          ) : (
            <div className="space-y-2">
              {selectedDay.periods.map((period) => {
                const current =
                  selectedIsToday &&
                  scheduleState.currentPeriod?.id === period.id &&
                  scheduleState.status !== "after_school";
                const completed =
                  selectedIsToday &&
                  scheduleState.completedPeriodIds.includes(period.id);

                return (
                  <div
                    key={period.id}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                      current
                        ? "border-[var(--school-primary)] bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] dark:bg-[color-mix(in_srgb,var(--school-primary)_20%,#242424)]"
                        : "border-slate-200 bg-slate-50 dark:border-[#3a3a3a] dark:bg-[#181818]"
                    }`}
                  >
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm font-black ${
                        completed
                          ? "border-[var(--school-primary)] text-[var(--school-primary)]"
                          : current
                            ? "border-[var(--school-primary)] bg-[var(--school-primary)] text-white"
                            : "border-slate-300 text-slate-500 dark:border-[#4a4a4a] dark:text-[#a3a3a3]"
                      }`}
                    >
                      {completed ? (
                        <CheckIcon className="h-5 w-5" />
                      ) : (
                        getPeriodIndicator(period.name)
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-black text-slate-950 dark:text-white">
                        {period.name}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                        {formatPeriodTime(period.start_time)} -{" "}
                        {formatPeriodTime(period.end_time)}
                      </p>
                    </div>

                    {current && (
                      <span className="rounded-full bg-[var(--school-primary)] px-3 py-1 text-[10px] font-black uppercase text-white">
                        Current
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function EmptyScheduleMessage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-[#181818]">
      <p className="font-black text-slate-950 dark:text-white">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
        {body}
      </p>
    </div>
  );
}

function getSelectedDaySummary(day: CalendarScheduleDay) {
  if (day.isSchoolDay === false) {
    return "No School";
  }

  if (!day.scheduleName) {
    return "No schedule assigned";
  }

  return day.scheduleType
    ? `${day.scheduleName} (${day.scheduleType})`
    : day.scheduleName;
}

function getScheduleIndicator(day: CalendarScheduleDay) {
  if (day.isSchoolDay === false) {
    return "bg-rose-500";
  }

  if (!day.scheduleName) {
    return null;
  }

  const value = `${day.scheduleName} ${day.scheduleType || ""} ${day.label || ""}`.toLowerCase();

  if (value.includes("brown")) {
    return "bg-amber-600";
  }

  if (value.includes("gold")) {
    return "bg-yellow-400";
  }

  if (value.includes("rally")) {
    return "bg-violet-500";
  }

  return "bg-emerald-500";
}

function getPeriodIndicator(name: string) {
  if (name.toLowerCase().includes("lunch")) {
    return "L";
  }

  const match = name.match(/\d+/);

  return match?.[0] || name.slice(0, 1).toUpperCase();
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m15 5-7 7 7 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
