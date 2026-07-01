"use client";

import { useState } from "react";
import { formatPeriodTime, type SchedulePeriod } from "@/lib/scheduleTime";

type WeekDay = {
  date: string;
  label: string;
  weekday: string;
  scheduleName: string;
  scheduleType: string | null;
  isSchoolDay: boolean;
  periods: SchedulePeriod[];
};

type WeeklyScheduleClientProps = {
  days: WeekDay[];
};

export default function WeeklyScheduleClient({ days }: WeeklyScheduleClientProps) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultDate = days.find((day) => day.date >= today)?.date || days[0]?.date;
  const [selectedWeek, setSelectedWeek] = useState<"A" | "B">("A");
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const selectedDay = days.find((day) => day.date === selectedDate) || days[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 rounded-2xl bg-slate-200/70 p-1 dark:bg-[#181818]">
        {(["A", "B"] as const).map((week) => (
          <button
            key={week}
            type="button"
            onClick={() => setSelectedWeek(week)}
            className={`rounded-xl px-4 py-2 text-sm font-black transition ${
              selectedWeek === week
                ? "bg-white text-slate-950 shadow-sm dark:bg-[#242424] dark:text-white"
                : "text-slate-500 dark:text-[#a3a3a3]"
            }`}
          >
            Week {week}
          </button>
        ))}
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {days.map((day) => {
          const selected = day.date === selectedDate;

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`min-w-28 rounded-[1.5rem] border p-4 text-left transition ${
                selected
                  ? "border-[var(--school-primary)] bg-white shadow-sm dark:bg-[#242424]"
                  : "border-slate-200 bg-white/70 dark:border-[#3a3a3a] dark:bg-[#242424]/70"
              }`}
            >
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                {day.weekday}
              </p>
              <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">
                {day.label}
              </p>
              <span className="mt-3 inline-flex rounded-full bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] px-2.5 py-1 text-[11px] font-black text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                {day.isSchoolDay ? day.scheduleName : "No School"}
              </span>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">
              {selectedDay.weekday}
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
              {selectedDay.scheduleName}
            </h2>
            {selectedDay.scheduleType && (
              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                {selectedDay.scheduleType}
              </p>
            )}
          </div>

          {selectedDay.periods.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500 dark:bg-[#181818] dark:text-[#a3a3a3]">
              No periods assigned.
            </p>
          ) : (
            <div className="space-y-2">
              {selectedDay.periods.map((period) => (
                <div
                  key={period.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-[#181818]"
                >
                  <p className="font-extrabold text-slate-950 dark:text-white">
                    {period.name}
                  </p>
                  <p className="text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                    {formatPeriodTime(period.start_time)} -{" "}
                    {formatPeriodTime(period.end_time)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
