"use client";

import Link from "next/link";
import { useState } from "react";
import { ClockIcon } from "@/components/mobile-app/AppIcons";
import { formatPeriodTime, type SchedulePeriod } from "@/lib/scheduleTime";

type BellSchedule = {
  id: string;
  name: string;
  type: string | null;
  setupStatus: string | null;
  periods: SchedulePeriod[];
};

type BellScheduleClientProps = {
  school: string;
  standardSchedules: BellSchedule[];
  modifiedSchedules: BellSchedule[];
};

export default function BellScheduleClient({
  school,
  standardSchedules,
  modifiedSchedules,
}: BellScheduleClientProps) {
  const [tab, setTab] = useState<"standard" | "modified">("standard");
  const schedules = tab === "standard" ? standardSchedules : modifiedSchedules;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 rounded-2xl bg-slate-200/70 p-1 dark:bg-[#181818]">
        {[
          { id: "standard", label: "Standard" },
          { id: "modified", label: "Modified" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id as "standard" | "modified")}
            className={`rounded-xl px-4 py-2 text-sm font-black transition ${
              tab === item.id
                ? "bg-white text-slate-950 shadow-sm dark:bg-[#242424] dark:text-white"
                : "text-slate-500 dark:text-[#a3a3a3]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {schedules.length === 0 ? (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
          <p className="text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
            No {tab} bell schedules are available yet.
          </p>
        </section>
      ) : (
        schedules.map((schedule) => (
          <section
            key={schedule.id}
            className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
          >
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--school-primary)]">
                Bell Schedule
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                {schedule.name}
              </h2>
            </div>

            {schedule.setupStatus === "needs_times" ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500 dark:bg-[#181818] dark:text-[#a3a3a3]">
                Bell times have not been added yet.
              </p>
            ) : (
            <div className="space-y-2">
              {schedule.periods.map((period) => (
                <div
                  key={period.id}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-[#181818]"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                    <ClockIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-slate-950 dark:text-white">
                      {period.name}
                    </p>
                    <p className="text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                      {formatPeriodTime(period.start_time)} -{" "}
                      {formatPeriodTime(period.end_time)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            )}
          </section>
        ))
      )}

      <Link
        href={`/${school}/app/schedule`}
        className="flex items-center justify-center rounded-2xl bg-[var(--school-primary)] px-4 py-4 text-sm font-black text-white shadow-lg shadow-slate-900/10"
      >
        View All Schedules
      </Link>
    </div>
  );
}
