import { describe, expect, it } from "vitest";
import { addDays, eachDateInRange, getWeekday, isDateString } from "./dateUtils";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import type { CalendarWizardConfig, DateString } from "./types";

const REGULAR = "regular";
const BROWN = "brown";
const GOLD = "gold";
const RALLY = "brown-rally";
const FINALS = "finals";
const ALL_PERIODS = "all-periods";
const EARLY_RELEASE = "early-release";

const mondayToFriday = [1, 2, 3, 4, 5] as const;

function baseConfig(
  overrides: Partial<CalendarWizardConfig> = {}
): CalendarWizardConfig {
  return {
    schoolYear: {
      startDate: "2026-08-10",
      endDate: "2026-08-14",
    },
    operatingWeekdays: [...mondayToFriday],
    pattern: {
      type: "same",
      scheduleId: REGULAR,
    },
    ...overrides,
  };
}

function day(result: ReturnType<typeof generateSchoolYearCalendar>, date: DateString) {
  const generatedDay = result.days.find((calendarDay) => calendarDay.date === date);
  expect(generatedDay, `Missing generated day for ${date}`).toBeDefined();
  return generatedDay!;
}

function schoolDays(result: ReturnType<typeof generateSchoolYearCalendar>) {
  return result.days.filter((calendarDay) => calendarDay.isSchoolDay);
}

describe("calendar wizard date utilities", () => {
  it("generates date-only strings without timezone drift", () => {
    expect(isDateString("2028-02-29")).toBe(true);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(getWeekday("2026-08-10")).toBe(1);
    expect(eachDateInRange("2026-08-10", "2026-08-12")).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });
});

describe("generateSchoolYearCalendar", () => {
  it("assigns the same schedule every operating day", () => {
    const result = generateSchoolYearCalendar(baseConfig());

    expect(result.summary.instructionalDayCount).toBe(5);
    expect(result.summary.countByActualSchedule).toEqual({ [REGULAR]: 5 });
    expect(schoolDays(result).every((calendarDay) => calendarDay.scheduleId === REGULAR)).toBe(
      true
    );
  });

  it("assigns a Brown/Gold alternating pattern", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
      })
    );

    expect(schoolDays(result).map((calendarDay) => calendarDay.scheduleId)).toEqual([
      BROWN,
      GOLD,
      BROWN,
      GOLD,
      BROWN,
    ]);
  });

  it("does not advance repeating patterns on weekends", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        schoolYear: {
          startDate: "2026-08-07",
          endDate: "2026-08-10",
        },
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
      })
    );

    expect(day(result, "2026-08-07").scheduleId).toBe(BROWN);
    expect(day(result, "2026-08-08").isSchoolDay).toBe(false);
    expect(day(result, "2026-08-09").isSchoolDay).toBe(false);
    expect(day(result, "2026-08-10").scheduleId).toBe(GOLD);
  });

  it("does not advance repeating patterns for a single holiday", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        noSchoolRanges: [{ startDate: "2026-08-11", label: "Holiday" }],
      })
    );

    expect(day(result, "2026-08-10").scheduleId).toBe(BROWN);
    expect(day(result, "2026-08-11").isSchoolDay).toBe(false);
    expect(day(result, "2026-08-12").scheduleId).toBe(GOLD);
  });

  it("keeps calendar-week alternation stable across holidays", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        schoolYear: { startDate: "2026-08-10", endDate: "2026-08-21" },
        pattern: {
          type: "calendar_week",
          scheduleIds: [BROWN, GOLD],
          startDate: "2026-08-10",
          startIndex: 0,
        },
        noSchoolRanges: [{ startDate: "2026-08-17", label: "Holiday" }],
      })
    );

    expect(day(result, "2026-08-14").scheduleId).toBe(BROWN);
    expect(day(result, "2026-08-17").isSchoolDay).toBe(false);
    expect(day(result, "2026-08-18").scheduleId).toBe(GOLD);
  });

  it("supports custom cycles that continue through no-school operating days", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD, REGULAR],
          pauseOnNoSchoolDays: false,
        },
        noSchoolRanges: [{ startDate: "2026-08-11", label: "Holiday" }],
      })
    );

    expect(day(result, "2026-08-10").scheduleId).toBe(BROWN);
    expect(day(result, "2026-08-12").scheduleId).toBe(REGULAR);
  });

  it("respects the configured instructional-cycle anchor date and starting position", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
          startDate: "2026-08-12",
          startIndex: 1,
        },
      })
    );

    expect(day(result, "2026-08-12").scheduleId).toBe(GOLD);
    expect(day(result, "2026-08-13").scheduleId).toBe(BROWN);
  });

  it("does not advance repeating patterns for a multi-day break", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        schoolYear: {
          startDate: "2026-11-20",
          endDate: "2026-11-30",
        },
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        noSchoolRanges: [
          {
            startDate: "2026-11-23",
            endDate: "2026-11-27",
            label: "Thanksgiving Break",
          },
        ],
      })
    );

    expect(day(result, "2026-11-20").scheduleId).toBe(BROWN);
    expect(day(result, "2026-11-23").isSchoolDay).toBe(false);
    expect(day(result, "2026-11-30").scheduleId).toBe(GOLD);
  });

  it("handles winter break across December and January", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        schoolYear: {
          startDate: "2026-12-18",
          endDate: "2027-01-05",
        },
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        noSchoolRanges: [
          {
            startDate: "2026-12-21",
            endDate: "2027-01-01",
            label: "Winter Recess",
          },
        ],
      })
    );

    expect(day(result, "2026-12-18").scheduleId).toBe(BROWN);
    expect(day(result, "2026-12-31").isSchoolDay).toBe(false);
    expect(day(result, "2027-01-04").scheduleId).toBe(GOLD);
  });

  it("preserves base schedule when a special instructional day uses another schedule", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        specialDays: [
          {
            startDate: "2026-08-11",
            scheduleId: RALLY,
            label: "Rally",
            rotationBehavior: "advance",
          },
        ],
      })
    );

    expect(day(result, "2026-08-11")).toMatchObject({
      baseScheduleId: GOLD,
      scheduleId: RALLY,
      isSchoolDay: true,
    });
  });

  it("advances the repeating pattern after an advance special day", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        specialDays: [
          {
            startDate: "2026-08-11",
            scheduleId: RALLY,
            label: "Rally",
            rotationBehavior: "advance",
          },
        ],
      })
    );

    expect(day(result, "2026-08-10").baseScheduleId).toBe(BROWN);
    expect(day(result, "2026-08-11").baseScheduleId).toBe(GOLD);
    expect(day(result, "2026-08-12").baseScheduleId).toBe(BROWN);
  });

  it("pauses the repeating pattern after a pause special day", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        specialDays: [
          {
            startDate: "2026-08-11",
            scheduleId: RALLY,
            label: "Rally",
            rotationBehavior: "pause",
          },
        ],
      })
    );

    expect(day(result, "2026-08-10").baseScheduleId).toBe(BROWN);
    expect(day(result, "2026-08-11").baseScheduleId).toBe(GOLD);
    expect(day(result, "2026-08-12").baseScheduleId).toBe(GOLD);
  });

  it("restarts the repeating pattern after the final date in a restart special range", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        specialDays: [
          {
            startDate: "2026-08-12",
            endDate: "2026-08-13",
            scheduleId: FINALS,
            label: "Finals",
            rotationBehavior: "restart",
          },
        ],
      })
    );

    expect(day(result, "2026-08-12")).toMatchObject({
      baseScheduleId: BROWN,
      scheduleId: FINALS,
    });
    expect(day(result, "2026-08-13")).toMatchObject({
      baseScheduleId: GOLD,
      scheduleId: FINALS,
    });
    expect(day(result, "2026-08-14").baseScheduleId).toBe(BROWN);
  });

  it("applies finals date ranges", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        schoolYear: {
          startDate: "2026-12-14",
          endDate: "2026-12-18",
        },
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        specialDays: [
          {
            startDate: "2026-12-16",
            endDate: "2026-12-18",
            scheduleId: FINALS,
            label: "Fall Finals",
            rotationBehavior: "advance",
          },
        ],
      })
    );

    expect(["2026-12-16", "2026-12-17", "2026-12-18"].map((date) => day(result, date).scheduleId)).toEqual([
      FINALS,
      FINALS,
      FINALS,
    ]);
    expect(result.summary.specialInstructionalDayCount).toBe(3);
  });

  it("supports weekday-based schedule assignment", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "weekday",
          schedulesByWeekday: {
            1: REGULAR,
            2: REGULAR,
            3: EARLY_RELEASE,
            4: REGULAR,
            5: REGULAR,
          },
        },
      })
    );

    expect(day(result, "2026-08-12").scheduleId).toBe(EARLY_RELEASE);
    expect(result.summary.countByActualSchedule).toEqual({
      [REGULAR]: 4,
      [EARLY_RELEASE]: 1,
    });
  });

  it("handles leap-year dates", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        schoolYear: {
          startDate: "2028-02-28",
          endDate: "2028-03-01",
        },
      })
    );

    expect(result.days.map((calendarDay) => calendarDay.date)).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
    expect(result.summary.instructionalDayCount).toBe(3);
  });

  it("keeps no-school status when a special day overlaps a no-school date", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        noSchoolRanges: [{ startDate: "2026-08-11", label: "Holiday" }],
        specialDays: [
          {
            startDate: "2026-08-11",
            scheduleId: RALLY,
            label: "Rally",
          },
        ],
      })
    );

    expect(day(result, "2026-08-11")).toMatchObject({
      isSchoolDay: false,
      scheduleId: null,
      baseScheduleId: null,
    });
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "special_day_overlaps_no_school"
    );
    expect(result.warnings.find((warning) => warning.code === "special_day_overlaps_no_school")).toMatchObject({
      dates: ["2026-08-11"],
      message: expect.stringContaining("Rally occurs during Holiday on 2026-08-11"),
    });
  });

  it("preserves an overlap label and pauses the repeating rotation", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: { type: "repeating", scheduleIds: [BROWN, GOLD] },
        noSchoolRanges: [{ startDate: "2026-08-11", label: "Recess" }],
        specialDays: [{
          startDate: "2026-08-11",
          scheduleId: RALLY,
          label: "Named Holiday",
        }],
      })
    );

    expect(day(result, "2026-08-11")).toMatchObject({
      isSchoolDay: false,
      scheduleId: null,
      labels: ["Recess", "Named Holiday"],
    });
    expect(day(result, "2026-08-12").scheduleId).toBe(GOLD);
  });

  it("allows informational special labels to coexist with no-school dates", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        noSchoolRanges: [{ startDate: "2026-08-11", label: "Holiday" }],
        specialDays: [
          {
            startDate: "2026-08-11",
            scheduleId: null,
            label: "District Office Closed",
            isInstructional: false,
          },
        ],
      })
    );

    expect(day(result, "2026-08-11")).toMatchObject({
      isSchoolDay: false,
      scheduleId: null,
      baseScheduleId: null,
      labels: ["Holiday", "District Office Closed"],
    });
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "special_day_overlaps_no_school"
    );
  });

  it("keeps informational labels without altering the schedule", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        informationalDates: [
          {
            date: "2026-08-12",
            label: "First Quarter Ends",
          },
        ],
      })
    );

    expect(day(result, "2026-08-12")).toMatchObject({
      isSchoolDay: true,
      scheduleId: REGULAR,
    });
    expect(day(result, "2026-08-12").labels).toEqual(["First Quarter Ends"]);
  });

  it("warns when weekday pattern is missing an operating weekday", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "weekday",
          schedulesByWeekday: {
            1: REGULAR,
          },
        },
      })
    );

    expect(result.warnings.map((warning) => warning.code)).toContain(
      "weekday_pattern_missing_schedule"
    );
    expect(result.summary.unassignedInstructionalDayCount).toBe(4);
  });

  it("returns a warning when the school year starts after it ends", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        schoolYear: {
          startDate: "2026-08-14",
          endDate: "2026-08-10",
        },
      })
    );

    expect(result.days).toEqual([]);
    expect(result.warnings[0]?.code).toBe("start_date_after_end_date");
  });

  it("warns for duplicate special rules on the same date", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        specialDays: [
          {
            startDate: "2026-08-12",
            scheduleId: RALLY,
            label: "Rally",
          },
          {
            startDate: "2026-08-12",
            scheduleId: FINALS,
            label: "Finals",
          },
        ],
      })
    );

    expect(day(result, "2026-08-12").scheduleId).toBe(RALLY);
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "duplicate_special_day"
    );
  });

  it("supports the first instructional day using a special schedule", () => {
    const result = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        specialDays: [
          {
            startDate: "2026-08-10",
            scheduleId: ALL_PERIODS,
            label: "First Day",
            rotationBehavior: "advance",
          },
        ],
      })
    );

    expect(day(result, "2026-08-10")).toMatchObject({
      baseScheduleId: BROWN,
      scheduleId: ALL_PERIODS,
    });
    expect(day(result, "2026-08-11").baseScheduleId).toBe(GOLD);
  });

  it("changing a special schedule does not corrupt the underlying repeating pattern", () => {
    const first = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        specialDays: [
          {
            startDate: "2026-08-12",
            scheduleId: RALLY,
            label: "Rally",
          },
        ],
      })
    );
    const second = generateSchoolYearCalendar(
      baseConfig({
        pattern: {
          type: "repeating",
          scheduleIds: [BROWN, GOLD],
        },
        specialDays: [
          {
            startDate: "2026-08-12",
            scheduleId: FINALS,
            label: "Finals",
          },
        ],
      })
    );

    expect(day(first, "2026-08-12").baseScheduleId).toBe(BROWN);
    expect(day(second, "2026-08-12").baseScheduleId).toBe(BROWN);
    expect(day(first, "2026-08-13").baseScheduleId).toBe(GOLD);
    expect(day(second, "2026-08-13").baseScheduleId).toBe(GOLD);
  });

  it("supports a Del Oro-style Brown/Gold fixture with 180 instructional days", () => {
    const result = generateSchoolYearCalendar({
      schoolYear: {
        name: "2026-2027",
        startDate: "2026-08-12",
        endDate: "2027-05-28",
      },
      operatingWeekdays: [...mondayToFriday],
      pattern: {
        type: "repeating",
        scheduleIds: [BROWN, GOLD],
      },
      noSchoolRanges: [
        { startDate: "2026-09-07", label: "Labor Day" },
        { startDate: "2026-10-12", label: "Non-Student Day" },
        { startDate: "2026-11-11", label: "Veterans Day" },
        {
          startDate: "2026-11-23",
          endDate: "2026-11-27",
          label: "Thanksgiving Break",
        },
        {
          startDate: "2026-12-21",
          endDate: "2027-01-01",
          label: "Winter Recess",
        },
        { startDate: "2027-01-18", label: "Martin Luther King Jr. Day" },
        { startDate: "2027-01-22", label: "Inservice Day" },
        { startDate: "2027-02-12", label: "Non-Student Day" },
        { startDate: "2027-02-15", label: "Presidents Day" },
        { startDate: "2027-03-12", label: "Non-Student Day" },
        {
          startDate: "2027-03-29",
          endDate: "2027-04-02",
          label: "Spring Break",
        },
      ],
      specialDays: [
        {
          startDate: "2026-08-12",
          scheduleId: ALL_PERIODS,
          label: "First Day",
          rotationBehavior: "advance",
        },
        {
          startDate: "2026-08-21",
          scheduleId: RALLY,
          label: "Rally",
          rotationBehavior: "advance",
        },
        {
          startDate: "2026-12-16",
          endDate: "2026-12-18",
          scheduleId: FINALS,
          label: "Fall Finals",
          rotationBehavior: "advance",
        },
        {
          startDate: "2027-05-24",
          endDate: "2027-05-26",
          scheduleId: FINALS,
          label: "Spring Finals",
          rotationBehavior: "advance",
        },
      ],
      informationalDates: [
        {
          date: "2026-10-09",
          label: "First Quarter Ends",
        },
        {
          date: "2026-12-18",
          label: "Fall Term Ends",
        },
      ],
    });

    expect(result.summary.instructionalDayCount).toBe(180);
    expect(result.summary.specialInstructionalDayCount).toBe(8);
    expect(day(result, "2026-08-12")).toMatchObject({
      baseScheduleId: BROWN,
      scheduleId: ALL_PERIODS,
    });
    expect(day(result, "2026-12-18").labels).toEqual([
      "Fall Term Ends",
      "Fall Finals",
    ]);
    expect(result.summary.unassignedInstructionalDayCount).toBe(0);
  });
});
