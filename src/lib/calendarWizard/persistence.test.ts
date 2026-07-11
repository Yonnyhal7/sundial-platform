import { describe, expect, it } from "vitest";
import {
  combineCalendarDayLabels,
  mapGeneratedDayToCalendarDayRow,
  shouldPersistGeneratedCalendarDay,
} from "./persistence";
import type { GeneratedCalendarDay } from "./types";

function generatedDay(overrides: Partial<GeneratedCalendarDay>): GeneratedCalendarDay {
  return {
    date: "2026-08-12",
    weekday: 3,
    isOperatingDay: true,
    isSchoolDay: true,
    baseScheduleId: "brown",
    scheduleId: "brown",
    labels: [],
    sources: {
      noSchoolRangeIds: [],
      specialDayIds: [],
      informationalDateIds: [],
    },
    warningCodes: [],
    ...overrides,
  };
}

describe("calendar wizard persistence mapping", () => {
  it("maps a normal instructional day", () => {
    expect(mapGeneratedDayToCalendarDayRow(generatedDay({}), "school-1")).toEqual({
      school_id: "school-1",
      date: "2026-08-12",
      schedule_id: "brown",
      base_schedule_id: "brown",
      label: null,
      is_school_day: true,
    });
  });

  it("maps a special instructional day with a separate base schedule", () => {
    expect(
      mapGeneratedDayToCalendarDayRow(
        generatedDay({
          baseScheduleId: "brown",
          scheduleId: "rally",
          labels: ["Rally"],
          sources: {
            noSchoolRangeIds: [],
            specialDayIds: ["special-1"],
            informationalDateIds: [],
          },
        }),
        "school-1"
      )
    ).toMatchObject({
      schedule_id: "rally",
      base_schedule_id: "brown",
      label: "Rally",
      is_school_day: true,
    });
  });

  it("maps no-school dates with null schedules", () => {
    expect(
      mapGeneratedDayToCalendarDayRow(
        generatedDay({
          isSchoolDay: false,
          baseScheduleId: null,
          scheduleId: null,
          labels: ["Winter Break"],
        }),
        "school-1"
      )
    ).toMatchObject({
      schedule_id: null,
      base_schedule_id: null,
      label: "Winter Break",
      is_school_day: false,
    });
  });

  it("combines labels predictably and removes duplicates", () => {
    expect(combineCalendarDayLabels(["Fall Term Ends", "Finals", "Finals"])).toBe(
      "Fall Term Ends • Finals"
    );
  });

  it("does not persist unlabeled non-operating weekend dates", () => {
    const weekend = generatedDay({
      date: "2026-08-15",
      weekday: 6,
      isOperatingDay: false,
      isSchoolDay: false,
      baseScheduleId: null,
      scheduleId: null,
      labels: [],
    });

    expect(shouldPersistGeneratedCalendarDay(weekend)).toBe(false);
    expect(mapGeneratedDayToCalendarDayRow(weekend, "school-1")).toBeNull();
  });

  it("persists labeled non-operating dates without schedules", () => {
    expect(
      mapGeneratedDayToCalendarDayRow(
        generatedDay({
          date: "2026-08-15",
          weekday: 6,
          isOperatingDay: false,
          isSchoolDay: false,
          baseScheduleId: null,
          scheduleId: null,
          labels: ["Graduation"],
        }),
        "school-1"
      )
    ).toMatchObject({
      schedule_id: null,
      base_schedule_id: null,
      label: "Graduation",
      is_school_day: false,
    });
  });
});
