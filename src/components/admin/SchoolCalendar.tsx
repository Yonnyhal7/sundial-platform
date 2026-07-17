"use client";

import { useState, type ReactNode } from "react";
import { getScheduleCalendarColor, getScheduleDotStyle } from "@/lib/scheduleColors";

export type SchoolCalendarSchedule = {
  id: string;
  name: string;
  type?: string | null;
  calendarColor?: string | null;
  setupStatus?: "ready" | "needs_times";
};

export type SchoolCalendarDay = {
  date: string;
  scheduleId: string | null;
  label?: string | null;
  isSchoolDay: boolean;
  isNoSchoolDay?: boolean;
  hasConflict?: boolean;
  needsReview?: boolean;
};

export type SchoolCalendarPeriod = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
};

function monthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function AdminCalendarView({
  days,
  schedules,
  selectedDate,
  onSelectedDateChange,
  onMonthChange,
  initialMonth = new Date(),
  firstMonth,
  lastMonth,
  details,
}: {
  days: SchoolCalendarDay[];
  schedules: SchoolCalendarSchedule[];
  selectedDate: string | null;
  onSelectedDateChange: (date: string) => void;
  onMonthChange?: (month: Date) => void;
  initialMonth?: Date;
  firstMonth?: Date;
  lastMonth?: Date;
  details: ReactNode;
}) {
  const [month, setMonth] = useState(() => monthStart(initialMonth));
  const previousDisabled = Boolean(firstMonth && monthKey(month) <= monthKey(monthStart(firstMonth)));
  const nextDisabled = Boolean(lastMonth && monthKey(month) >= monthKey(monthStart(lastMonth)));

  function changeMonth(offset: number) {
    const nextMonth = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1)
    );
    setMonth(nextMonth);
    onMonthChange?.(nextMonth);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <SchoolCalendarMonthGrid
        month={month}
        days={days}
        schedules={schedules}
        selectedDate={selectedDate}
        onSelectDate={onSelectedDateChange}
        navigation={
          <CalendarMonthNavigation
            month={month}
            previousDisabled={previousDisabled}
            nextDisabled={nextDisabled}
            onPrevious={() => changeMonth(-1)}
            onNext={() => changeMonth(1)}
          />
        }
      />
      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {details}
      </aside>
    </div>
  );
}

export function CalendarMonthNavigation({
  month,
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
}: {
  month: Date;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mb-4 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:mb-5 sm:gap-4">
      <button type="button" onClick={onPrevious} disabled={previousDisabled} className="cursor-pointer rounded-xl border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:px-3 sm:text-sm">
        <span className="sm:hidden">←</span><span className="hidden sm:inline">← Previous</span>
      </button>
      <h3 className="text-center text-lg font-semibold text-slate-950 dark:text-white sm:text-xl">
        {month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
      </h3>
      <button type="button" onClick={onNext} disabled={nextDisabled} className="cursor-pointer rounded-xl border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:px-3 sm:text-sm">
        <span className="sm:hidden">→</span><span className="hidden sm:inline">Next →</span>
      </button>
    </div>
  );
}

export function CalendarDateCell({ day, dayNumber, schedule, selected, onSelect }: {
  day: SchoolCalendarDay | null;
  dayNumber: number;
  schedule?: SchoolCalendarSchedule | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const isNoSchoolDay = day?.isNoSchoolDay ?? day?.isSchoolDay === false;
  const label = isNoSchoolDay
    ? day?.label || "No School"
    : schedule?.name || day?.label || "No assignment";
  const indicatorColor = isNoSchoolDay ? "#E11D48" : schedule ? getScheduleCalendarColor(schedule) : "#94A3B8";
  return (
    <button type="button" onClick={onSelect} className={[
      "relative aspect-square min-h-12 cursor-pointer overflow-hidden rounded-xl border p-1.5 text-left transition sm:p-2",
      selected ? "border-[var(--school-primary)] bg-[color-mix(in_srgb,var(--school-primary)_10%,white)] text-[var(--school-primary)] shadow-sm ring-2 ring-[var(--school-primary)]/20 dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,transparent)] dark:text-white" : isNoSchoolDay ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200" : "border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700",
      day?.hasConflict ? "border-red-500 ring-2 ring-red-500/30" : "",
      day?.needsReview && !day?.hasConflict ? "border-amber-500 ring-2 ring-amber-400/40" : "",
    ].join(" ")} aria-label={`${day?.date || dayNumber}, ${label}${day?.hasConflict ? ", conflict" : ""}${day?.needsReview ? ", needs review" : ""}`}>
      <span className="text-[clamp(0.8rem,2.3vw,1.35rem)] font-semibold leading-none">{dayNumber}</span>
      {day && (schedule || day.label || isNoSchoolDay || day.hasConflict) && (
        <span className="absolute bottom-2 left-1/2 flex max-w-[calc(100%-0.75rem)] -translate-x-1/2 items-center gap-1" title={label}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border sm:h-3 sm:w-3" style={getScheduleDotStyle(day.hasConflict ? "#DC2626" : indicatorColor)} />
        </span>
      )}
      {day?.needsReview && (
        <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-amber-400 text-[10px] font-black text-amber-950" aria-hidden="true">!</span>
      )}
    </button>
  );
}

export function SchoolCalendarMonthGrid({ month, days, schedules, selectedDate, onSelectDate, navigation }: {
  month: Date;
  days: SchoolCalendarDay[];
  schedules: SchoolCalendarSchedule[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  navigation?: ReactNode;
}) {
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const trailingCellCount = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const scheduleMap = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
      {navigation}
      <div className="grid grid-cols-7 gap-1 text-center text-[clamp(0.62rem,1.4vw,0.8rem)] font-semibold text-slate-500 sm:gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => <div key={name}>{name}</div>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 sm:mt-3 sm:gap-2">
        {Array.from({ length: firstWeekday }, (_, index) => <div key={`empty-${index}`} data-calendar-empty="leading" className="aspect-square" />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const dayNumber = index + 1;
          const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
          const day = dayMap.get(date) || { date, scheduleId: null, isSchoolDay: false, isNoSchoolDay: false, label: null };
          return <CalendarDateCell key={date} day={day} dayNumber={dayNumber} schedule={day.scheduleId ? scheduleMap.get(day.scheduleId) : null} selected={selectedDate === date} onSelect={() => onSelectDate(date)} />;
        })}
        {Array.from({ length: trailingCellCount }, (_, index) => <div key={`trailing-${index}`} data-calendar-empty="trailing" className="aspect-square" />)}
      </div>
      <CalendarScheduleLegend schedules={schedules} />
    </section>
  );
}

export function CalendarScheduleLegend({ schedules }: { schedules: SchoolCalendarSchedule[] }) {
  if (!schedules.length) return null;
  return <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
    {schedules.map((schedule) => <span key={schedule.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"><span className="h-3 w-3 rounded-full border" style={getScheduleDotStyle(getScheduleCalendarColor(schedule))} />{schedule.name}</span>)}
  </div>;
}

function formatTime(time: string) {
  return new Date(`2000-01-01T${time}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function CalendarScheduleDetails({ schedule, periods = [] }: { schedule: SchoolCalendarSchedule | null; periods?: SchoolCalendarPeriod[] }) {
  if (!schedule) return null;
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{schedule.name}</h4>
    {schedule.type && <p className="mt-1 text-xs text-slate-500">{schedule.type}</p>}
    {periods.length ? <div className="mt-4 space-y-2">{periods.map((period) => <div key={period.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><span className="font-medium">{period.name}</span><span className="text-slate-500">{formatTime(period.startTime)} - {formatTime(period.endTime)}</span></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No periods have been added to this schedule yet.</p>}
  </div>;
}
