export type SchedulePeriod = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number | null;
};

export type ScheduleStatus =
  | "before_school"
  | "in_period"
  | "passing"
  | "after_school"
  | "no_schedule"
  | "needs_times";

export type TodayScheduleState = {
  currentPeriod: SchedulePeriod | null;
  nextPeriod: SchedulePeriod | null;
  status: ScheduleStatus;
  countdownLabel: "Starts In" | "Time Remaining" | "School Day Complete";
  countdownTarget: Date | null;
  completedPeriodIds: string[];
  progressPercent: number;
};

export function sortPeriodsByScheduleOrder(periods: SchedulePeriod[]) {
  return [...periods].sort((a, b) => {
    const aSortOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bSortOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    const sortOrderDelta = aSortOrder - bSortOrder;

    if (sortOrderDelta !== 0) {
      return sortOrderDelta;
    }

    return a.start_time.localeCompare(b.start_time);
  });
}

export function timeToDate(time: string, baseDate: Date) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(baseDate);

  date.setHours(hours, minutes, 0, 0);

  return date;
}

export function formatPeriodTime(time: string) {
  return new Date(`2000-01-01T${time}`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatCountdownDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    const hourLabel = hours === 1 ? "hr" : "hrs";
    const minuteLabel = minutes === 1 ? "min" : "mins";

    return `${hours} ${hourLabel} ${minutes} ${minuteLabel}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getTodayScheduleState(
  periods: SchedulePeriod[],
  now: Date,
  options: { needsTimes?: boolean } = {}
): TodayScheduleState {
  if (options.needsTimes) {
    return {
      currentPeriod: null,
      nextPeriod: null,
      status: "needs_times",
      countdownLabel: "Starts In",
      countdownTarget: null,
      completedPeriodIds: [],
      progressPercent: 0,
    };
  }

  const sortedPeriods = sortPeriodsByScheduleOrder(periods);

  if (sortedPeriods.length === 0) {
    return {
      currentPeriod: null,
      nextPeriod: null,
      status: "no_schedule",
      countdownLabel: "Starts In",
      countdownTarget: null,
      completedPeriodIds: [],
      progressPercent: 0,
    };
  }

  const completedPeriodIds = sortedPeriods
    .filter((period) => now >= timeToDate(period.end_time, now))
    .map((period) => period.id);

  for (let i = 0; i < sortedPeriods.length; i++) {
    const period = sortedPeriods[i];
    const start = timeToDate(period.start_time, now);
    const end = timeToDate(period.end_time, now);
    const nextPeriod = sortedPeriods[i + 1] ?? null;

    if (now >= start && now < end) {
      const total = end.getTime() - start.getTime();
      const elapsed = now.getTime() - start.getTime();

      return {
        currentPeriod: period,
        nextPeriod,
        status: "in_period",
        countdownLabel: "Time Remaining",
        countdownTarget: end,
        completedPeriodIds,
        progressPercent: total > 0 ? (elapsed / total) * 100 : 0,
      };
    }

    if (now < start) {
      const status = i === 0 ? "before_school" : "passing";

      return {
        currentPeriod: period,
        nextPeriod: period,
        status,
        countdownLabel: "Starts In",
        countdownTarget: start,
        completedPeriodIds,
        progressPercent: 0,
      };
    }
  }

  return {
    currentPeriod: null,
    nextPeriod: null,
    status: "after_school",
    countdownLabel: "School Day Complete",
    countdownTarget: null,
    completedPeriodIds,
    progressPercent: 100,
  };
}
