"use client";

import { useMemo, useState } from "react";

type Schedule = {
  id: string;
  schedule_name: string;
  schedule_type: string | null;
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

  function handleSubmit() {
    if (!selectedDate) return;

    const existingDay = assignedDays.get(selectedDate);

    if (existingDay) {
        existingDay.is_school_day = isSchoolDay;
        existingDay.schedule_id = isSchoolDay ? selectedScheduleId || null : null;
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={previousMonth}
            className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Previous
          </button>

          <h2 className="text-xl font-semibold">
            {currentDate.toLocaleString("default", {
              month: "long",
              year: "numeric",
            })}
          </h2>

          <button
            type="button"
            onClick={nextMonth}
            className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Next →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-400">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-2">
          {days.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="min-h-28" />;
            }

            const dateString = formatDate(day);
            const calendarDay = assignedDays.get(dateString);

            const assignedSchedule = calendarDay?.schedule_id
              ? scheduleMap.get(calendarDay.schedule_id)
              : null;

            const isSelected = selectedDate === dateString;

            

            return (
              <button
                key={dateString}
                type="button"
                onClick={() => {
                    setSelectedDate(dateString);
                    setSelectedScheduleId(calendarDay?.schedule_id || "");
                    setIsSchoolDay(calendarDay?.is_school_day ?? true);
                }}
                className={`min-h-28 cursor-pointer rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                }`}
              >
                <div className="font-semibold text-white">{day}</div>

                {assignedSchedule && (
                  <div className="mt-2 rounded-lg bg-green-500/15 px-2 py-1 text-xs font-medium text-green-300">
                    {assignedSchedule.schedule_name}
                  </div>
                )}

                {calendarDay?.label && (
                  <div className="mt-1 line-clamp-2 text-xs text-slate-400">
                    {calendarDay.label}
                  </div>
                )}

                {calendarDay && calendarDay.is_school_day === false && (
                  <div className="mt-2 rounded-lg bg-red-500/15 px-2 py-1 text-xs font-medium text-red-300">
                    No School
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="text-xl font-semibold">Assign Schedule</h2>

        {!selectedDate ? (
          <p className="mt-3 text-sm text-slate-400">
            Select a date on the calendar to assign a schedule.
          </p>
        ) : (
          <form key={`${selectedDate}-${selectedCalendarDay?.schedule_id || "none"}`} action={action} onSubmit={handleSubmit} className="mt-5 space-y-5">
            <input type="hidden" name="date" value={selectedDate} />

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Selected Date
              </label>
              <div className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-slate-200">
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Schedule
              </label>
              <select
                name="schedule_id"
                value={selectedScheduleId}
                onChange={(e) => setSelectedScheduleId(e.target.value)}
                disabled={!isSchoolDay}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
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
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Optional Note / Event Name
              </label>
              <input
                name="label"
                defaultValue={selectedCalendarDay?.label || ""}
                placeholder="Example: Homecoming Rally"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
              />
            </div>

            <label className="flex items-center gap-3">
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
            <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
                This date will be marked as No School. No bell schedule will be shown.
            </div>
            )}

            {isSchoolDay && selectedSchedule && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="text-sm font-semibold text-slate-200">
                  {selectedSchedule.schedule_name}
                </h3>

                {selectedSchedule.schedule_type && (
                  <p className="mt-1 text-xs text-slate-400">
                    {selectedSchedule.schedule_type}
                  </p>
                )}

                {selectedSchedulePeriods.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {selectedSchedulePeriods.map((period) => (
                      <div
                        key={period.id}
                        className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-slate-200">
                          {period.name}
                        </span>
                        <span className="text-slate-400">
                          {formatTime(period.start_time)} -{" "}
                          {formatTime(period.end_time)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    No periods have been added to this schedule yet.
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500"
            >
              Save Calendar Day
            </button>
          </form>
        )}
      </aside>
    </div>
  );
}