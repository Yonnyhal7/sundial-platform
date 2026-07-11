"use client";

import { useMemo, useState } from "react";
import { getScheduleCalendarColor, getScheduleDotStyle } from "@/lib/scheduleColors";

type Schedule = {
  id: string;
  schedule_name: string;
  schedule_type: string | null;
  calendar_color: string | null;
  active: boolean;
};

type CalendarDay = {
  id: string;
  date: string;
  schedule_id: string | null;
  label: string | null;
  is_school_day: boolean | null;
};

type Period = {
  id: string;
  schedule_id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number;
};

export default function CalendarClient({
  schedules,
  calendarDays,
  periods,
  action,
}: {
  schedules: Schedule[];
  calendarDays: CalendarDay[];
  periods: Period[];
  action: (formData: FormData) => void;
}) {
  const today = new Date();

  const [currentDate, setCurrentDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [isSchoolDay, setIsSchoolDay] = useState(true);
  const assignedDays = useMemo(() => {
    return new Map(calendarDays.map((day) => [day.date, day]));
  }, [calendarDays]);

  const scheduleMap = useMemo(() => {
    return new Map(schedules.map((schedule) => [schedule.id, schedule]));
  }, [schedules]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const selectedCalendarDay = selectedDate
    ? assignedDays.get(selectedDate)
    : null;

  const activeScheduleId =
  selectedScheduleId || selectedCalendarDay?.schedule_id || "";

    const selectedSchedule = activeScheduleId
    ? scheduleMap.get(activeScheduleId)
    : null;

  const selectedSchedulePeriods = activeScheduleId
  ? periods.filter((period) => period.schedule_id === activeScheduleId)
  : [];

  function formatDate(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
  }

  function formatTime(time: string) {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function previousMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
        <div className="mb-4 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:mb-5 sm:gap-4">
          <button
            type="button"
            onClick={previousMonth}
            className="cursor-pointer rounded-xl border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:px-3 sm:text-sm"
          >
            <span className="sm:hidden">←</span>
            <span className="hidden sm:inline">← Previous</span>
          </button>

          <h2 className="text-center text-lg font-semibold text-slate-950 dark:text-white sm:text-xl">
            {currentDate.toLocaleString("default", {
              month: "long",
              year: "numeric",
            })}
          </h2>

          <button
            type="button"
            onClick={nextMonth}
            className="cursor-pointer rounded-xl border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:px-3 sm:text-sm"
          >
            <span className="sm:hidden">→</span>
            <span className="hidden sm:inline">Next →</span>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[clamp(0.62rem,1.4vw,0.8rem)] font-semibold text-slate-500 dark:text-[#a3a3a3] sm:gap-2">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 sm:mt-3 sm:gap-2">
          {days.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const dateString = formatDate(day);
            const calendarDay = assignedDays.get(dateString);

            const assignedSchedule = calendarDay?.schedule_id
              ? scheduleMap.get(calendarDay.schedule_id)
              : null;

            const isSelected = selectedDate === dateString;

            const hasIndicator =
              Boolean(assignedSchedule) ||
              Boolean(calendarDay?.label) ||
              calendarDay?.is_school_day === false;
            const indicatorColor =
              calendarDay?.is_school_day === false
                ? "#E11D48"
                : assignedSchedule
                  ? getScheduleCalendarColor(assignedSchedule)
                  : "#94A3B8";
            const indicatorLabel =
              calendarDay?.is_school_day === false
                ? calendarDay.label || "No School"
                : assignedSchedule?.schedule_name || calendarDay?.label || "Calendar note";

            return (
              <button
                key={dateString}
                type="button"
                onClick={() => {
                    setSelectedDate(dateString);
                    setSelectedScheduleId(calendarDay?.schedule_id || "");
                    setIsSchoolDay(calendarDay?.is_school_day ?? true);
                }}
                className={`relative aspect-square cursor-pointer overflow-hidden rounded-xl border p-1.5 text-left transition sm:p-2 ${
                  isSelected
                    ? "border-[var(--school-primary)] bg-[color-mix(in_srgb,var(--school-primary)_10%,white)] text-[var(--school-primary)] shadow-sm dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,transparent)] dark:text-white"
                    : "border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                }`}
                aria-label={`${dateString}${hasIndicator ? `, ${indicatorLabel}` : ""}`}
              >
                <div className="text-[clamp(0.8rem,2.3vw,1.35rem)] font-semibold leading-none">
                  {day}
                </div>

                {hasIndicator && (
                  <span
                    className="absolute bottom-2 left-1/2 flex max-w-[calc(100%-0.75rem)] -translate-x-1/2 items-center justify-center gap-1 sm:bottom-2.5 sm:gap-1.5"
                    aria-hidden="true"
                    title={indicatorLabel}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border sm:h-3 sm:w-3"
                      style={getScheduleDotStyle(indicatorColor)}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {schedules.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            {schedules.map((schedule) => {
              const color = getScheduleCalendarColor(schedule);

              return (
                <span
                  key={schedule.id}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <span
                    className="h-3 w-3 rounded-full border"
                    style={getScheduleDotStyle(color)}
                    aria-hidden="true"
                  />
                  {schedule.schedule_name}
                </span>
              );
            })}
          </div>
        )}
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Assign Schedule</h2>

        {!selectedDate ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-[#a3a3a3]">
            Select a date on the calendar to assign a schedule.
          </p>
        ) : (
          <form key={`${selectedDate}-${selectedCalendarDay?.schedule_id || "none"}`} action={action} className="mt-5 space-y-5">
            <input type="hidden" name="date" value={selectedDate} />

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Selected Date
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Schedule
              </label>
              <select
                name="schedule_id"
                value={selectedScheduleId}
                onChange={(e) => setSelectedScheduleId(e.target.value)}
                disabled={!isSchoolDay}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">No schedule</option>
                {schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.schedule_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Optional Note / Event Name
              </label>
              <input
                name="label"
                defaultValue={selectedCalendarDay?.label || ""}
                placeholder="Example: Homecoming Rally"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
              />
            </div>

            <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                <input
                    type="checkbox"
                    name="is_school_day"
                    checked={isSchoolDay}
                    onChange={(e) => {
                    setIsSchoolDay(e.target.checked);

                    if (!e.target.checked) {
                        setSelectedScheduleId("");
                    }
                    }}
                />
                School day
            </label>

            {!isSchoolDay && (
            <div className="rounded-xl border border-rose-200 bg-rose-100 p-4 text-sm font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-200">
                This date will be marked as No School. No bell schedule will be shown.
            </div>
            )}

            {isSchoolDay && selectedSchedule && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {selectedSchedule.schedule_name}
                </h3>

                {selectedSchedule.schedule_type && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-[#a3a3a3]">
                    {selectedSchedule.schedule_type}
                  </p>
                )}

                {selectedSchedulePeriods.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {selectedSchedulePeriods.map((period) => (
                      <div
                        key={period.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <span className="font-medium text-slate-900 dark:text-white">
                          {period.name}
                        </span>
                        <span className="text-slate-500 dark:text-[#a3a3a3]">
                          {formatTime(period.start_time)} -{" "}
                          {formatTime(period.end_time)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500 dark:text-[#a3a3a3]">
                    No periods have been added to this schedule yet.
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              className="w-full cursor-pointer rounded-lg bg-[var(--school-primary)] px-4 py-3 font-semibold text-[var(--school-primary-text)] transition hover:opacity-90"
            >
              Save Calendar Day
            </button>
          </form>
        )}
      </aside>
    </div>
  );
}
