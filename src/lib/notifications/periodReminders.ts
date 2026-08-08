import {
  schoolLocalDateTimeToUtc,
  type NotificationAudience,
} from "@/lib/notifications";
import {
  formatPeriodTime,
  sortPeriodsByScheduleOrder,
  type SchedulePeriod,
} from "@/lib/scheduleTime";

export const PERIOD_REMINDER_CATEGORY = "period_reminder" as const;
export const PERIOD_REMINDER_LEAD_MINUTES = 5;

export type PeriodReminderSchool = {
  id: string;
  subdomain: string;
  timezone: string;
};

export type PeriodReminderSettings = {
  notifications_enabled: boolean;
  period_reminders_enabled: boolean;
  period_reminder_minutes_before: number;
  period_reminder_audiences: NotificationAudience[];
};

export type PeriodReminderCalendarDay = {
  school_id: string;
  date: string;
  schedule_id: string | null;
  is_school_day: boolean | null;
};

export type PeriodReminderSchedule = {
  id: string;
  school_id: string;
  active: boolean | null;
  setup_status: string | null;
};

export type PeriodReminderCandidate = {
  schoolId: string;
  schoolSlug: string;
  scheduleDate: string;
  scheduleId: string;
  periodId: string;
  periodName: string;
  periodStart: Date;
  reminderAt: Date;
  title: string;
  body: string;
  destinationPath: string;
  audiences: NotificationAudience[];
  leadMinutes: number;
};

export function resolvePeriodReminderCandidates({
  school,
  settings,
  calendarDay,
  schedule,
  periods,
}: {
  school: PeriodReminderSchool;
  settings: PeriodReminderSettings;
  calendarDay: PeriodReminderCalendarDay | null;
  schedule: PeriodReminderSchedule | null;
  periods: SchedulePeriod[];
}) {
  if (
    !settings.notifications_enabled ||
    !settings.period_reminders_enabled ||
    settings.period_reminder_minutes_before !== PERIOD_REMINDER_LEAD_MINUTES ||
    settings.period_reminder_audiences.length === 0 ||
    !calendarDay ||
    calendarDay.school_id !== school.id ||
    calendarDay.is_school_day === false ||
    !calendarDay.schedule_id ||
    !schedule ||
    schedule.id !== calendarDay.schedule_id ||
    schedule.school_id !== school.id ||
    schedule.active === false ||
    schedule.setup_status === "needs_times"
  ) {
    return [];
  }

  return sortPeriodsByScheduleOrder(periods).flatMap<PeriodReminderCandidate>(
    (period) => {
      const startTime = period.start_time.slice(0, 5);
      const periodStart = schoolLocalDateTimeToUtc(
        `${calendarDay.date}T${startTime}`,
        school.timezone,
      );
      if (!periodStart) return [];

      const name = period.name.trim() || "Next period";
      return [
        {
          schoolId: school.id,
          schoolSlug: school.subdomain,
          scheduleDate: calendarDay.date,
          scheduleId: schedule.id,
          periodId: period.id,
          periodName: name,
          periodStart,
          reminderAt: new Date(
            periodStart.getTime() -
              settings.period_reminder_minutes_before * 60_000,
          ),
      title: `${name} starts in ${settings.period_reminder_minutes_before} minutes`.slice(0, 80),
      body: `${name} begins at ${formatPeriodTime(period.start_time)}.`.slice(0, 180),
          destinationPath: `/${school.subdomain}/app`,
          audiences: [...settings.period_reminder_audiences],
          leadMinutes: settings.period_reminder_minutes_before,
        },
      ];
    },
  );
}

export function getDuePeriodReminderCandidates(
  candidates: PeriodReminderCandidate[],
  now: Date,
) {
  const current = now.getTime();
  return candidates.filter(
    (candidate) =>
      candidate.reminderAt.getTime() <= current &&
      current < candidate.periodStart.getTime(),
  );
}

export function getNextPeriodReminder(
  candidates: PeriodReminderCandidate[],
  now: Date,
) {
  const current = now.getTime();
  return (
    [...candidates]
      .filter((candidate) => candidate.reminderAt.getTime() > current)
      .sort(
        (left, right) => left.reminderAt.getTime() - right.reminderAt.getTime(),
      )[0] || null
  );
}

export function filterPeriodReminderDevices<
  T extends {
    id: string;
    audience: NotificationAudience;
    permission_status: string;
  },
>(
  devices: T[],
  audiences: NotificationAudience[],
  enabledPreferenceDeviceIds: Iterable<string>,
  subscribedDeviceIds: Iterable<string>,
) {
  const allowedAudiences = new Set(audiences);
  const enabledPreferences = new Set(enabledPreferenceDeviceIds);
  const subscriptions = new Set(subscribedDeviceIds);
  return devices.filter(
    (device) =>
      device.permission_status === "granted" &&
      allowedAudiences.has(device.audience) &&
      enabledPreferences.has(device.id) &&
      subscriptions.has(device.id),
  );
}

export async function processPeriodReminderSchoolsIndependently<T>(
  schools: T[],
  processSchool: (school: T) => Promise<number>,
) {
  let processed = 0;
  let failed = 0;
  for (const school of schools) {
    try {
      processed += await processSchool(school);
    } catch {
      failed += 1;
    }
  }
  return { schools: schools.length, processed, failed };
}
