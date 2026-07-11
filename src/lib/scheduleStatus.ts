import type { SchedulePeriod } from "./scheduleTime";

export type ScheduleSetupStatus = "ready" | "needs_times";

export function normalizeScheduleSetupStatus(
  value: string | null | undefined,
  periods: Pick<SchedulePeriod, "name" | "start_time" | "end_time">[] = []
): ScheduleSetupStatus {
  if (value === "needs_times") return "needs_times";
  if (value === "ready") return "ready";

  return periods.some(hasValidPeriodTimes) ? "ready" : "needs_times";
}

export function hasValidPeriodTimes(
  period: Pick<SchedulePeriod, "name" | "start_time" | "end_time">
) {
  return Boolean(period.name?.trim() && period.start_time && period.end_time);
}

export function getScheduleSetupStatusForPeriods(
  periods: Pick<SchedulePeriod, "name" | "start_time" | "end_time">[]
): ScheduleSetupStatus {
  return periods.some(hasValidPeriodTimes) ? "ready" : "needs_times";
}

export function scheduleNeedsBellTimes(
  setupStatus: string | null | undefined,
  periods: Pick<SchedulePeriod, "name" | "start_time" | "end_time">[] = []
) {
  return normalizeScheduleSetupStatus(setupStatus, periods) === "needs_times";
}

export function scheduleSetupStatusLabel(status: ScheduleSetupStatus) {
  return status === "ready" ? "Ready" : "Bell times needed";
}
