"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "@/components/mobile-app/AppIcons";
import {
  getAdjacentCalendarMonthKey,
  getCalendarSwipeMonthOffset,
  normalizeCalendarMonthKey,
} from "@/lib/calendarMonthNavigation";
import { useOfflineSchoolData } from "@/lib/offline/useOfflineSchoolData";
import {
  getCalendarScheduleDays,
  getMonthGridDates,
} from "@/lib/offline/snapshotSelectors";
import { formatLocalDate } from "@/lib/localDate";
import {
  formatPeriodTime,
  getTodayScheduleState,
  type SchedulePeriod,
} from "@/lib/scheduleTime";
import { getScheduleCalendarColor, getScheduleDotStyle } from "@/lib/scheduleColors";
import { hasMeaningfulCalendarDayStatus } from "@/lib/calendarDaySchedule";

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
  scheduleColor: string | null;
  scheduleSetupStatus: string | null;
  label: string | null;
  periods: SchedulePeriod[];
};

export type CalendarScheduleMonth = {
  monthKey: string;
  monthLabel: string;
  days: CalendarScheduleDay[];
};

type CalendarScheduleClientProps = {
  currentMonthKey: string;
  today: string;
  months: CalendarScheduleMonth[];
  timeZone: string;
};

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarScheduleClient({
  currentMonthKey,
  today,
  months,
  timeZone,
}: CalendarScheduleClientProps) {
  const router = useRouter();
  const { snapshot } = useOfflineSchoolData();
  const [visibleMonthKey, setVisibleMonthKey] = useState(currentMonthKey);
  const [localMonths, setLocalMonths] = useState(
    () => new Map(months.map((month) => [month.monthKey, month]))
  );
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startTime: number;
    horizontal: boolean | null;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const visibleMonth = localMonths.get(visibleMonthKey) || months[0];
  const days = visibleMonth?.days || [];
  const monthLabel = visibleMonth?.monthLabel || "Calendar";
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

  useEffect(() => {
    function handleHistoryNavigation() {
      const requestedMonthKey =
        normalizeCalendarMonthKey(
          new URL(window.location.href).searchParams.get("month")
        ) || currentMonthKey;
      const requestedMonth =
        localMonths.get(requestedMonthKey) ||
        getSnapshotMonth(snapshot, requestedMonthKey);

      if (!requestedMonth) {
        router.refresh();
        return;
      }

      setVisibleMonthKey(requestedMonthKey);
      setSelectedDate(getDefaultSelectedDate(requestedMonth.days, today));
    }

    window.addEventListener("popstate", handleHistoryNavigation);
    return () => window.removeEventListener("popstate", handleHistoryNavigation);
  }, [currentMonthKey, localMonths, router, snapshot, today]);

  const selectedIsToday = selectedDay?.date === today;
  const scheduleState = useMemo(() => {
    if (!selectedIsToday || !now || !selectedDay) {
      return getTodayScheduleState([], new Date(), { timeZone });
    }

    return getTodayScheduleState(selectedDay.periods, now, {
      needsTimes: selectedDay.scheduleSetupStatus === "needs_times",
      timeZone,
    });
  }, [now, selectedDay, selectedIsToday, timeZone]);

  function selectDate(date: string) {
    setSelectedDate(date);
  }

  function getMonthView(monthKey: string) {
    const existing = localMonths.get(monthKey);
    if (existing) return existing;
    return getSnapshotMonth(snapshot, monthKey);
  }

  function changeMonth(offset: number) {
    const targetMonthKey = getAdjacentCalendarMonthKey(visibleMonthKey, offset);
    if (!targetMonthKey) return;

    const targetMonth = getMonthView(targetMonthKey);
    const href = `?month=${targetMonthKey}`;

    if (!targetMonth) {
      router.push(href, { scroll: false });
      return;
    }

    setLocalMonths((current) => {
      if (current.has(targetMonthKey)) return current;
      const next = new Map(current);
      next.set(targetMonthKey, targetMonth);
      return next;
    });
    setVisibleMonthKey(targetMonthKey);
    setSelectedDate(getDefaultSelectedDate(targetMonth.days, today));
    window.history.pushState(null, "", href);
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse") return;

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startTime: performance.now(),
      horizontal: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    const deltaX = gesture.lastX - gesture.startX;
    const deltaY = gesture.lastY - gesture.startY;

    if (gesture.horizontal === null) {
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return;
      gesture.horizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
    }

    if (!gesture.horizontal) return;

    event.preventDefault();
    setIsDragging(true);
    setDragX(Math.max(-54, Math.min(54, deltaX * 0.45)));
  }

  function handlePointerEnd(event: PointerEvent<HTMLElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDragX(0);
    setIsDragging(false);
    if (!gesture.horizontal) return;

    suppressClickRef.current = true;
    const offset = getCalendarSwipeMonthOffset({
      deltaX: gesture.lastX - gesture.startX,
      deltaY: gesture.lastY - gesture.startY,
      elapsedMs: performance.now() - gesture.startTime,
    });

    if (offset) changeMonth(offset);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  return (
    <div className="space-y-5">
      <section
        data-swipe-nav-ignore
        className="touch-pan-y rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424]"
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        style={{
          transform: dragX ? `translate3d(${dragX}px, 0, 0)` : undefined,
          transition: isDragging ? "none" : "transform 160ms ease-out",
        }}
      >
        <div className="mb-3 grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="Previous month"
            className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-[#181818] dark:text-[#d4d4d4] dark:hover:bg-[#202020]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>

          <h2
            aria-live="polite"
            className="text-center text-xl font-black text-slate-950 dark:text-white"
          >
            {monthLabel}
          </h2>

          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="Next month"
            className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-[#181818] dark:text-[#d4d4d4] dark:hover:bg-[#202020]"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
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
                    className="absolute bottom-1.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full border"
                    style={getScheduleDotStyle(indicator.color)}
                    title={indicator.label}
                    aria-hidden="true"
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

function getDefaultSelectedDate(days: CalendarScheduleDay[], today: string) {
  return (
    days.find((day) => day.date === today)?.date ||
    days.find((day) => day.inCurrentMonth)?.date ||
    days[0]?.date ||
    today
  );
}

function getSnapshotMonth(
  snapshot: ReturnType<typeof useOfflineSchoolData>["snapshot"],
  monthKey: string
) {
  if (!snapshot || !snapshotCoversMonth(snapshot.data.calendarDays, monthKey)) {
    return null;
  }

  const snapshotMonth = getCalendarScheduleDays(snapshot, monthKey);
  return {
    monthKey,
    monthLabel: snapshotMonth.baseMonth.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
    days: snapshotMonth.days,
  } satisfies CalendarScheduleMonth;
}

function snapshotCoversMonth(
  calendarDays: Array<{ date: string }>,
  monthKey: string
) {
  const normalized = normalizeCalendarMonthKey(monthKey);
  if (!normalized || calendarDays.length === 0) return false;

  const [year, month] = normalized.split("-").map(Number);
  const gridDates = getMonthGridDates(new Date(year, month - 1, 1));
  const firstAvailableDate = calendarDays[0]?.date;
  const lastAvailableDate = calendarDays[calendarDays.length - 1]?.date;
  const firstGridDate = formatLocalDate(gridDates[0]);
  const lastGridDate = formatLocalDate(gridDates[gridDates.length - 1]);

  return (
    Boolean(firstAvailableDate && lastAvailableDate) &&
    firstAvailableDate <= firstGridDate &&
    lastAvailableDate >= lastGridDate
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
  if (!hasMeaningfulCalendarDayStatus({ scheduleId: day.scheduleName, label: day.label, isSchoolDay: day.isSchoolDay })) {
    return null;
  }

  if (day.isSchoolDay === false) {
    return { color: "#E11D48", label: day.label || "No School" };
  }

  if (!day.scheduleName) {
    return null;
  }

  return {
    color: getScheduleCalendarColor({
      name: day.scheduleName,
      calendar_color: day.scheduleColor,
    }),
    label: getSelectedDaySummary(day),
  };
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
