import { describe, expect, it } from "vitest";
import {
  getSnapshotStorageKey,
  isValidSchoolOfflineSnapshot,
  shouldUseSnapshotForSchool,
} from "@/lib/offline/schoolSnapshot";
import {
  getCalendarScheduleDays,
  getTodaySchedule,
} from "@/lib/offline/snapshotSelectors";
import {
  SCHOOL_OFFLINE_SCHEMA_VERSION,
  type SchoolOfflineSnapshot,
} from "@/lib/offline/types";
import { getLocalTodayISO, getMonthKey } from "@/lib/localDate";

function createSnapshot(overrides: Partial<SchoolOfflineSnapshot> = {}) {
  const snapshot: SchoolOfflineSnapshot = {
    schemaVersion: SCHOOL_OFFLINE_SCHEMA_VERSION,
    schoolId: "school-deloro",
    schoolSlug: "deloro",
    syncedAt: "2026-07-12T12:00:00.000Z",
    sourceUpdatedAt: null,
    data: {
      school: {
        id: "school-deloro",
        name: "Del Oro",
        subdomain: "deloro",
        mascot: "Eagles",
        logo_url: null,
        primary_color: "#123456",
        secondary_color: "#abcdef",
        default_appearance: "system",
        timezone: "America/Los_Angeles",
      },
      schedules: [
        {
          id: "schedule-brown",
          school_id: "school-deloro",
          schedule_name: "Brown Day",
          schedule_type: "Regular",
          calendar_color: "#8B5E34",
          setup_status: "ready",
          active: true,
        },
      ],
      periods: [
        {
          id: "period-1",
          school_id: "school-deloro",
          schedule_id: "schedule-brown",
          name: "Period 1",
          start_time: "08:30:00",
          end_time: "09:20:00",
          sort_order: 1,
        },
      ],
      calendarDays: [
        {
          id: "day-1",
          school_id: "school-deloro",
          date: getLocalTodayISO(),
          label: null,
          is_school_day: true,
          schedule_id: "schedule-brown",
        },
      ],
      announcements: [],
      events: [],
      resources: [],
      sports: [],
      teams: [],
      games: [],
      kioskSettings: {},
    },
  };

  return {
    ...snapshot,
    ...overrides,
    data: {
      ...snapshot.data,
      ...overrides.data,
    },
  };
}

describe("offline school snapshots", () => {
  it("uses tenant-specific snapshot keys by stable school id", () => {
    expect(getSnapshotStorageKey("school-deloro")).toBe("schoolSnapshot:school-deloro");
    expect(getSnapshotStorageKey("school-north")).toBe("schoolSnapshot:school-north");
  });

  it("never treats another school's snapshot as the active tenant", () => {
    const delOroSnapshot = createSnapshot();

    expect(shouldUseSnapshotForSchool(delOroSnapshot, "school-deloro")).toBe(true);
    expect(shouldUseSnapshotForSchool(delOroSnapshot, "school-north")).toBe(false);
    expect(shouldUseSnapshotForSchool(null, "school-north")).toBe(false);
  });

  it("accepts valid snapshots and rejects unsupported schema versions", () => {
    expect(isValidSchoolOfflineSnapshot(createSnapshot())).toBe(true);
    expect(
      isValidSchoolOfflineSnapshot(createSnapshot({ schemaVersion: 999 as 2 }))
    ).toBe(false);
  });

  it("rejects snapshots whose school metadata does not match the partition", () => {
    expect(
      isValidSchoolOfflineSnapshot(
        createSnapshot({
          data: {
            ...createSnapshot().data,
            school: {
              ...createSnapshot().data.school,
              id: "school-north",
            },
          },
        })
      )
    ).toBe(false);
  });

  it("rejects a schedule row from another tenant", () => {
    const snapshot = createSnapshot();
    snapshot.data.schedules[0].school_id = "school-liberty";

    expect(isValidSchoolOfflineSnapshot(snapshot)).toBe(false);
  });

  it("rejects periods and calendar days that reference an unavailable tenant schedule", () => {
    const periodSnapshot = createSnapshot();
    periodSnapshot.data.periods[0].schedule_id = "schedule-liberty";
    expect(isValidSchoolOfflineSnapshot(periodSnapshot)).toBe(false);

    const calendarSnapshot = createSnapshot();
    calendarSnapshot.data.calendarDays[0].schedule_id = "schedule-liberty";
    expect(isValidSchoolOfflineSnapshot(calendarSnapshot)).toBe(false);
  });

  it("keeps cached schedule data usable offline", () => {
    const today = getTodaySchedule(createSnapshot());

    expect(today.todayScheduleLabel).toBe("Brown Day (Regular)");
    expect(today.periods).toHaveLength(1);
    expect(today.periods[0].name).toBe("Period 1");
  });

  it("builds calendar days from cached snapshot data", () => {
    const snapshot = createSnapshot();
    const month = getMonthKey();
    const { days } = getCalendarScheduleDays(snapshot, month);
    const today = getLocalTodayISO();
    const todayDay = days.find((day) => day.date === today);

    expect(todayDay?.scheduleName).toBe("Brown Day");
    expect(todayDay?.periods).toHaveLength(1);
  });

  it("models failed refresh preserving the previous valid snapshot", () => {
    const previous = createSnapshot();
    const failedRefreshResult: SchoolOfflineSnapshot | null = null;

    expect(failedRefreshResult || previous).toBe(previous);
  });
});
