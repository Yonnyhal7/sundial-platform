"use client";

import { useMemo, useState } from "react";
import {
  CalendarMonthNavigation,
  CalendarScheduleDetails,
  SchoolCalendarMonthGrid,
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
      <SchoolCalendarMonthGrid
        month={new Date(Date.UTC(year, month, 1))}
        days={calendarDays.map((day) => ({ date: day.date, scheduleId: day.schedule_id, label: day.label, isSchoolDay: day.is_school_day ?? true }))}
        schedules={schedules.map((schedule) => ({ id: schedule.id, name: schedule.schedule_name, type: schedule.schedule_type, calendarColor: schedule.calendar_color }))}
        selectedDate={selectedDate}
        onSelectDate={(dateString) => {
          const calendarDay = assignedDays.get(dateString);
          setSelectedDate(dateString);
          setSelectedScheduleId(calendarDay?.schedule_id || "");
          setIsSchoolDay(calendarDay?.is_school_day ?? true);
        }}
        navigation={<CalendarMonthNavigation month={new Date(Date.UTC(year, month, 1))} onPrevious={previousMonth} onNext={nextMonth} />}
      />

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
          </form>
        )}
      </aside>
    </div>
  );
}
