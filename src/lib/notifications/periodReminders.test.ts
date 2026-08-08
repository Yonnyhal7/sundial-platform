import { describe, expect, it, vi } from "vitest";
import {
  filterPeriodReminderDevices,
  getDuePeriodReminderCandidates,
  getNextPeriodReminder,
  PERIOD_REMINDER_LEAD_MINUTES,
  processPeriodReminderSchoolsIndependently,
  resolvePeriodReminderCandidates,
  type PeriodReminderSettings,
} from "@/lib/notifications/periodReminders";

const school = {
  id: "school-a",
  subdomain: "lincoln",
  timezone: "America/Los_Angeles",
};
const settings: PeriodReminderSettings = {
  notifications_enabled: true,
  period_reminders_enabled: true,
  period_reminder_minutes_before: PERIOD_REMINDER_LEAD_MINUTES,
  period_reminder_audiences: ["student", "staff"],
};
const day = {
  school_id: "school-a",
  date: "2026-08-10",
  schedule_id: "gold",
  is_school_day: true,
};
const schedule = {
  id: "gold",
  school_id: "school-a",
  active: true,
  setup_status: "complete",
};
const periods = [
  {
    id: "p2",
    name: "Period 2",
    start_time: "10:05:00",
    end_time: "11:20:00",
    sort_order: 2,
  },
  {
    id: "p1",
    name: "Physics",
    start_time: "08:30:00",
    end_time: "09:45:00",
    sort_order: 1,
  },
];

function candidates(overrides: Partial<PeriodReminderSettings> = {}) {
  return resolvePeriodReminderCandidates({
    school,
    settings: { ...settings, ...overrides },
    calendarDay: day,
    schedule,
    periods,
  });
}

describe("period reminder schedule resolution", () => {
  it("defaults remain representable as disabled with a fixed five-minute lead", () => {
    expect(candidates({ period_reminders_enabled: false })).toEqual([]);
    expect(PERIOD_REMINDER_LEAD_MINUTES).toBe(5);
  });

  it("resolves each period from the Calendar-assigned schedule", () => {
    expect(candidates().map((candidate) => candidate.periodId)).toEqual([
      "p1",
      "p2",
    ]);
  });

  it("uses special-schedule times when that schedule is assigned", () => {
    const rally = resolvePeriodReminderCandidates({
      school,
      settings,
      calendarDay: { ...day, schedule_id: "rally" },
      schedule: { ...schedule, id: "rally" },
      periods: [{ ...periods[0], id: "rally-p2", start_time: "09:45:00" }],
    });
    expect(rally[0].body).toBe("Period 2 begins at 9:45 AM.");
  });

  it("returns no reminders without an active school schedule", () => {
    expect(
      resolvePeriodReminderCandidates({
        school,
        settings,
        calendarDay: null,
        schedule: null,
        periods,
      }),
    ).toEqual([]);
    expect(
      resolvePeriodReminderCandidates({
        school,
        settings,
        calendarDay: { ...day, is_school_day: false },
        schedule,
        periods,
      }),
    ).toEqual([]);
  });

  it("generates a reminder exactly five minutes before period start", () => {
    const candidate = candidates()[0];
    expect(
      candidate.periodStart.getTime() - candidate.reminderAt.getTime(),
    ).toBe(5 * 60_000);
    expect(
      getDuePeriodReminderCandidates([candidate], candidate.reminderAt),
    ).toEqual([candidate]);
  });

  it("does not treat a reminder as due after its period begins", () => {
    const candidate = candidates()[0];
    expect(
      getDuePeriodReminderCandidates([candidate], candidate.periodStart),
    ).toEqual([]);
  });

  it("resolves school-local times independently across timezones", () => {
    const pacific = candidates()[0];
    const eastern = resolvePeriodReminderCandidates({
      school: {
        ...school,
        id: "school-b",
        subdomain: "east",
        timezone: "America/New_York",
      },
      settings,
      calendarDay: { ...day, school_id: "school-b" },
      schedule: { ...schedule, school_id: "school-b" },
      periods: [periods[1]],
    })[0];
    expect(pacific.periodStart.getTime() - eastern.periodStart.getTime()).toBe(
      3 * 60 * 60_000,
    );
  });

  it("keeps DST dates on the intended school-local date and clock time", () => {
    const dst = resolvePeriodReminderCandidates({
      school,
      settings,
      calendarDay: { ...day, date: "2026-11-02" },
      schedule,
      periods: [periods[1]],
    })[0];
    expect(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: school.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(dst.periodStart),
    ).toBe("2026-11-02, 08:30");
  });

  it("finds the next future reminder for Settings status", () => {
    const list = candidates();
    expect(
      getNextPeriodReminder(list, new Date(list[0].reminderAt.getTime() - 1))
        ?.periodId,
    ).toBe("p1");
  });
});

describe("period reminder delivery eligibility", () => {
  const devices = [
    {
      id: "student",
      audience: "student" as const,
      permission_status: "granted",
    },
    { id: "staff", audience: "staff" as const, permission_status: "granted" },
    { id: "parent", audience: "parent" as const, permission_status: "granted" },
    { id: "denied", audience: "student" as const, permission_status: "denied" },
  ];

  it("excludes non-selected audiences", () => {
    expect(
      filterPeriodReminderDevices(
        devices,
        ["student"],
        ["student", "staff", "parent", "denied"],
        ["student", "staff", "parent", "denied"],
      ).map((device) => device.id),
    ).toEqual(["student"]);
  });

  it("requires the device preference to be on", () => {
    expect(
      filterPeriodReminderDevices(
        devices,
        ["student", "staff"],
        ["staff"],
        ["student", "staff"],
      ).map((device) => device.id),
    ).toEqual(["staff"]);
  });

  it("requires granted permission and an active subscription", () => {
    expect(
      filterPeriodReminderDevices(
        devices,
        ["student"],
        ["student", "denied"],
        ["student"],
      ).map((device) => device.id),
    ).toEqual(["student"]);
  });
});

describe("period reminder failure isolation", () => {
  it("continues processing other schools after one fails", async () => {
    const process = vi.fn(async (id: string) => {
      if (id === "bad") throw new Error("malformed schedule");
      return 2;
    });
    await expect(
      processPeriodReminderSchoolsIndependently(["bad", "good"], process),
    ).resolves.toEqual({ schools: 2, processed: 2, failed: 1 });
    expect(process).toHaveBeenCalledTimes(2);
  });
});
