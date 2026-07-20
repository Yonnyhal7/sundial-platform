"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AdminCalendarView,
  CalendarScheduleDetails,
} from "@/components/admin/SchoolCalendar";

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

type ClearResult = { status: "success" | "error"; message: string; date?: string };

function naturalSchoolDay(date: string) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return weekday !== 0 && weekday !== 6;
}

export default function CalendarClient({
  schedules,
  calendarDays,
  periods,
  action,
  clearAction,
}: {
  schedules: Schedule[];
  calendarDays: CalendarDay[];
  periods: Period[];
  action: (formData: FormData) => void;
  clearAction: (date: string) => Promise<ClearResult>;
}) {
  const router = useRouter();
  const today = new Date();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [isSchoolDay, setIsSchoolDay] = useState(true);
  const [clearedDates, setClearedDates] = useState<Set<string>>(() => new Set());
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearMessage, setClearMessage] = useState<ClearResult | null>(null);
  const [isClearing, startClearing] = useTransition();
  const clearTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const displayedCalendarDays = useMemo(() => calendarDays.filter((day) => !clearedDates.has(day.date)), [calendarDays, clearedDates]);
  const assignedDays = useMemo(() => {
    return new Map(displayedCalendarDays.map((day) => [day.date, day]));
  }, [displayedCalendarDays]);

  const scheduleMap = useMemo(() => {
    return new Map(schedules.map((schedule) => [schedule.id, schedule]));
  }, [schedules]);

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

  useEffect(() => {
    if (!confirmingClear) return;
    const focusTimer = window.setTimeout(() => confirmButtonRef.current?.focus(), 0);
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setConfirmingClear(false);
      window.setTimeout(() => clearTriggerRef.current?.focus(), 0);
    }
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [confirmingClear]);

  function closeClearDialog() {
    setConfirmingClear(false);
    window.setTimeout(() => clearTriggerRef.current?.focus(), 0);
  }

  function clearSelectedDay() {
    if (!selectedDate || !selectedCalendarDay) return;
    startClearing(async () => {
      const result = await clearAction(selectedDate);
      setClearMessage(result);
      if (result.status !== "success") return;
      setClearedDates((current) => new Set(current).add(selectedDate));
      setSelectedScheduleId("");
      setIsSchoolDay(naturalSchoolDay(selectedDate));
      setConfirmingClear(false);
      router.refresh();
    });
  }

  return (
    <><AdminCalendarView
      initialMonth={new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1))}
      days={displayedCalendarDays.map((day) => ({ date: day.date, scheduleId: day.schedule_id, label: day.label, isSchoolDay: day.is_school_day ?? true }))}
      schedules={schedules.map((schedule) => ({ id: schedule.id, name: schedule.schedule_name, type: schedule.schedule_type, calendarColor: schedule.calendar_color }))}
      selectedDate={selectedDate}
      onSelectedDateChange={(dateString) => {
        const calendarDay = assignedDays.get(dateString);
        setSelectedDate(dateString);
        setSelectedScheduleId(calendarDay?.schedule_id || "");
        setIsSchoolDay(calendarDay?.is_school_day ?? naturalSchoolDay(dateString));
        setClearMessage(null);
      }}
      onMonthChange={() => setSelectedDate(null)}
      details={
        <>
        <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Assign Schedule</h2>

        {!selectedDate ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-[#a3a3a3]">
            Select a date on the calendar to assign a schedule.
          </p>
        ) : (
          <form key={`${selectedDate}-${selectedCalendarDay?.id || "untouched"}`} action={action} onSubmit={() => { setClearedDates((current) => { const next = new Set(current); next.delete(selectedDate); return next; }); setClearMessage(null); }} className="mt-5 space-y-5">
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
                onChange={(e) => { setSelectedScheduleId(e.target.value); if (e.target.value) setIsSchoolDay(true); }}
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
                This date will be marked as No School when saved. No bell schedule will be shown.
            </div>
            )}

            {isSchoolDay && selectedSchedule && <CalendarScheduleDetails
              schedule={{ id: selectedSchedule.id, name: selectedSchedule.schedule_name, type: selectedSchedule.schedule_type, calendarColor: selectedSchedule.calendar_color }}
              periods={selectedSchedulePeriods.map((period) => ({ id: period.id, name: period.name, startTime: period.start_time, endTime: period.end_time }))}
            />}

            <button
              type="submit"
              className="w-full cursor-pointer rounded-lg bg-[var(--school-primary)] px-4 py-3 font-semibold text-[var(--school-primary-text)] transition hover:opacity-90"
            >
              Save Calendar Day
            </button>

            {selectedCalendarDay && <button ref={clearTriggerRef} type="button" onClick={() => setConfirmingClear(true)} className="w-full cursor-pointer rounded-lg border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40">Clear Calendar Day</button>}

            {clearMessage && <p role={clearMessage.status === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm font-semibold ${clearMessage.status === "success" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200"}`}>{clearMessage.message}</p>}
          </form>
        )}
        </>
      }
    />

    {confirmingClear && selectedDate && <div className="fixed inset-0 z-[100] grid place-items-center px-4" role="dialog" aria-modal="true" aria-labelledby="clear-calendar-day-title" aria-describedby="clear-calendar-day-description">
      <button type="button" aria-label="Cancel clearing calendar day" className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-sm" onClick={closeClearDialog} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700 dark:text-red-300">Clear saved information</p>
        <h2 id="clear-calendar-day-title" className="mt-2 text-xl font-bold">Clear calendar information for {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}?</h2>
        <p id="clear-calendar-day-description" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">This will remove the assigned schedule, school-day status, no-school status, and optional note for this date. The date will return to its default calendar state.</p>
        <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={isClearing} onClick={closeClearDialog} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Cancel</button><button ref={confirmButtonRef} type="button" disabled={isClearing} onClick={clearSelectedDay} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60">{isClearing ? "Clearing…" : "Clear Day"}</button></div>
      </div>
    </div>}</>
  );
}
