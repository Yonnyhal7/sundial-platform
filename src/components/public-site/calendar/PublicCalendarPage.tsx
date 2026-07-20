"use client";

import { useMemo, useState } from "react";
import { getScheduleCalendarColor, getScheduleDotStyle } from "@/lib/scheduleColors";
import { formatPeriodTime } from "@/lib/scheduleTime";
import { getMonthGridDateStrings, shiftMonthKey, type PublicCalendarDay, type PublicCalendarViewModel } from "@/lib/publicCalendar";

const weekdays = [
  ["S", "Sun"], ["M", "Mon"], ["T", "Tue"], ["W", "Wed"], ["T", "Thu"], ["F", "Fri"], ["S", "Sat"],
];

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatFullDate(date: string) {
  return parseDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function monthLabel(monthKey: string) {
  return parseDate(`${monthKey}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function isSpecialDay(day: PublicCalendarDay | undefined) {
  return Boolean(day?.isSchoolDay && day.label && day.label !== day.scheduleName);
}

function CalendarArrow({ direction }: { direction: "left" | "right" }) {
  return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d={direction === "left" ? "m15 18-6-6 6-6" : "m9 6 6 6-6 6"} /></svg>;
}

function dayDescription(day: PublicCalendarDay | undefined, isToday: boolean) {
  const parts = [day ? formatFullDate(day.date) : "Calendar date"];
  if (isToday) parts.push("Today");
  if (day?.isSchoolDay === false) parts.push(day.label || "No School");
  else if (day?.scheduleName) parts.push(day.scheduleName);
  if (isSpecialDay(day)) parts.push(day!.label!);
  if (day?.events.length) parts.push(`${day.events.length} school ${day.events.length === 1 ? "event" : "events"}`);
  return parts.join(", ");
}

function DayCell({ date, day, currentMonth, today, selected, academicYear, onSelect }: {
  date: string;
  day?: PublicCalendarDay;
  currentMonth: string;
  today: string;
  selected: boolean;
  academicYear: PublicCalendarViewModel["academicYear"];
  onSelect: (date: string) => void;
}) {
  const inCurrentMonth = date.startsWith(currentMonth);
  const isToday = date === today;
  const isWeekend = [0, 6].includes(parseDate(date).getDay());
  const outsideYear = academicYear ? date < academicYear.startDate || date > academicYear.endDate : true;
  const interactive = Boolean(day);
  const scheduleColor = day?.scheduleName ? getScheduleCalendarColor({ name: day.scheduleName, calendar_color: day.scheduleColor }) : null;
  const special = isSpecialDay(day);
  const statusClass = day?.isSchoolDay === false
    ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-100"
    : special
      ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-100"
      : day
        ? "border-slate-200 bg-white dark:border-white/10 dark:bg-[#1b1e21]"
        : "border-transparent bg-transparent text-slate-400 dark:text-slate-600";
  const content = <>
    <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black sm:h-8 sm:w-8 sm:text-sm ${isToday ? "bg-[var(--school-primary)] text-[var(--school-primary-text)]" : ""}`}>{Number(date.slice(-2))}</span>
    {day && <span className="mt-1 hidden w-full min-w-0 sm:block"><span className="line-clamp-2 text-[10px] font-bold leading-tight sm:text-xs">{day.isSchoolDay === false ? day.label || "No School" : special ? day.label : day.scheduleName || "School day"}</span></span>}
    <span className="mt-auto flex min-h-2 items-center gap-1 pt-1 sm:min-h-3">
      {scheduleColor && <span aria-hidden="true" className="h-2 w-2 rounded-full border" style={getScheduleDotStyle(scheduleColor)} />}
      {day?.isSchoolDay === false && <span aria-hidden="true" className="h-1.5 w-3 rounded-full bg-rose-500" />}
      {special && <span aria-hidden="true" className="h-2 w-2 rotate-45 rounded-[2px] bg-amber-500" />}
      {day?.events.length ? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sky-500" /> : null}
    </span>
  </>;
  const classes = `relative flex aspect-square min-h-11 min-w-0 flex-col items-start overflow-hidden rounded-xl border p-1.5 text-left transition sm:aspect-auto sm:min-h-24 sm:p-2 ${statusClass} ${selected ? "ring-2 ring-[var(--school-primary)] ring-offset-2 dark:ring-offset-[#101214]" : ""} ${!inCurrentMonth ? "opacity-40" : ""} ${!day && (isWeekend || outsideYear) ? "opacity-35" : ""}`;

  return interactive ? <button type="button" aria-pressed={selected} aria-label={dayDescription(day, isToday)} onClick={() => onSelect(date)} className={`${classes} cursor-pointer hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] focus:ring-offset-2 dark:focus:ring-offset-[#101214]`}>{content}</button> : <div aria-hidden="true" className={classes}>{content}</div>;
}

function SelectedDayPanel({ day }: { day: PublicCalendarDay | null }) {
  if (!day) return <aside className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1b1e21] lg:sticky lg:top-28"><p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Select a published calendar date to view its details.</p></aside>;
  return <aside aria-live="polite" className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1b1e21] sm:p-6 lg:sticky lg:top-28">
    <p className="text-xs font-black uppercase tracking-[.18em] text-[var(--school-primary)]">Selected day</p>
    <h2 className="mt-2 text-2xl font-black tracking-tight">{formatFullDate(day.date)}</h2>
    {day.isSchoolDay === false ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/25"><p className="font-black text-rose-800 dark:text-rose-100">No School</p><p className="mt-1 text-sm text-rose-700 dark:text-rose-200">{day.label || "School is closed."}</p></div> : <>
      <div className="mt-5 flex items-start gap-3">
        {day.scheduleName && <span className="mt-1 h-3 w-3 shrink-0 rounded-full border" style={getScheduleDotStyle(getScheduleCalendarColor({ name: day.scheduleName, calendar_color: day.scheduleColor }))} />}
        <div><p className="font-black">{day.scheduleName || "School day"}</p>{day.scheduleType && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{day.scheduleType}</p>}{isSpecialDay(day) && <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">{day.label}</p>}</div>
      </div>
      {!day.scheduleName ? <p className="mt-5 rounded-2xl bg-slate-100 p-4 text-sm text-slate-600 dark:bg-white/[.06] dark:text-slate-300">A bell schedule has not been assigned for this date.</p> : day.scheduleSetupStatus === "needs_times" || day.periods.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-100 p-4 text-sm text-slate-600 dark:bg-white/[.06] dark:text-slate-300">Bell times have not been published yet.</p> : <div className="mt-5 space-y-2">{day.periods.map((period) => <div key={period.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3 dark:bg-white/[.05]"><span className="min-w-0 truncate text-sm font-bold">{period.name}</span><span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">{formatPeriodTime(period.start_time)} – {formatPeriodTime(period.end_time)}</span></div>)}</div>}
    </>}
    {day.events.length > 0 && <div className="mt-6 border-t border-slate-200 pt-5 dark:border-white/10"><h3 className="text-sm font-black">School events</h3><div className="mt-3 space-y-2">{day.events.map((event) => <div key={event.id} className="rounded-xl bg-sky-50 p-3 dark:bg-sky-950/25"><p className="text-sm font-bold">{event.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{event.startTime ? formatPeriodTime(event.startTime) : "All day"}{event.location ? ` · ${event.location}` : ""}</p></div>)}</div></div>}
  </aside>;
}

export default function PublicCalendarPage({ calendar }: { calendar: PublicCalendarViewModel }) {
  const todayMonth = calendar.today.slice(0, 7);
  const [visibleMonth, setVisibleMonth] = useState(todayMonth);
  const [selectedDate, setSelectedDate] = useState(calendar.days.some((day) => day.date === calendar.today) ? calendar.today : null);
  const dayByDate = useMemo(() => new Map(calendar.days.map((day) => [day.date, day])), [calendar.days]);
  const gridDates = useMemo(() => getMonthGridDateStrings(visibleMonth), [visibleMonth]);
  const visibleDays = calendar.days.filter((day) => day.date.startsWith(visibleMonth));
  const selectedDay = selectedDate ? dayByDate.get(selectedDate) || null : null;

  function changeMonth(nextMonth: string) {
    setVisibleMonth(nextMonth);
    setSelectedDate(nextMonth === todayMonth && dayByDate.has(calendar.today) ? calendar.today : calendar.days.find((day) => day.date.startsWith(nextMonth))?.date || null);
  }

  if (!calendar.academicYear) return <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-[#1b1e21] sm:p-8"><h2 className="text-xl font-black">Calendar coming soon</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">The school calendar has not been published yet.</p></section>;

  const hasNoSchool = visibleDays.some((day) => !day.isSchoolDay);
  const hasSpecial = visibleDays.some((day) => isSpecialDay(day));
  const hasSchoolDay = visibleDays.some((day) => day.isSchoolDay);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#1b1e21] sm:p-4">
      <div className="flex items-center gap-2"><button type="button" aria-label="Previous month" onClick={() => changeMonth(shiftMonthKey(visibleMonth, -1))} className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] dark:bg-white/10 dark:hover:bg-white/15"><CalendarArrow direction="left" /></button><button type="button" aria-label="Next month" onClick={() => changeMonth(shiftMonthKey(visibleMonth, 1))} className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] dark:bg-white/10 dark:hover:bg-white/15"><CalendarArrow direction="right" /></button></div>
      <h2 aria-live="polite" className="order-first w-full text-center text-xl font-black sm:order-none sm:w-auto sm:text-2xl">{monthLabel(visibleMonth)}</h2>
      <button type="button" onClick={() => changeMonth(todayMonth)} className="min-h-11 rounded-full border border-slate-300 px-4 text-sm font-black hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] dark:border-white/20 dark:hover:bg-white/10">Today</button>
    </div>

    {visibleDays.length === 0 && <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-white/[.06] dark:text-slate-300">No school calendar information is available for this month.</p>}

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]">
      <section aria-label={`${monthLabel(visibleMonth)} calendar`} className="min-w-0 rounded-[1.75rem] border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-[#1b1e21] sm:p-5">
        <div className="grid grid-cols-7 gap-1 sm:gap-2">{weekdays.map(([narrow, wide], index) => <div key={`${wide}-${index}`} className="py-2 text-center text-[11px] font-black uppercase tracking-wide text-slate-400"><span className="sm:hidden">{narrow}</span><span className="hidden sm:inline">{wide}</span></div>)}</div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">{gridDates.map((date) => <DayCell key={date} date={date} day={dayByDate.get(date)} currentMonth={visibleMonth} today={calendar.today} selected={selectedDate === date} academicYear={calendar.academicYear} onSelect={setSelectedDate} />)}</div>
      </section>
      <SelectedDayPanel day={selectedDay} />
    </div>

    <div aria-label="Calendar legend" className="flex flex-wrap gap-x-5 gap-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-[#1b1e21] dark:text-slate-300">
      {visibleMonth === todayMonth && <span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-[var(--school-primary)]" />Today</span>}
      {hasSchoolDay && <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-slate-300 bg-white dark:border-white/30 dark:bg-[#1b1e21]" />School day</span>}
      {hasSpecial && <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-500" />Special schedule</span>}
      {hasNoSchool && <span className="inline-flex items-center gap-2"><span className="h-1.5 w-4 rounded-full bg-rose-500" />No school</span>}
    </div>
  </div>;
}
