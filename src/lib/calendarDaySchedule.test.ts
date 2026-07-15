import { describe, expect, it } from "vitest";
import {
  getAssignedScheduleForCalendarDay,
  getCalendarDayScheduleIds,
  getScheduleByIdForSchool,
  getScheduleDisplayName,
  type CalendarDayScheduleAssignment,
  type CalendarDayScheduleSummary,
} from "@/lib/calendarDaySchedule";

function schedule(
  overrides: Partial<CalendarDayScheduleSummary> = {}
): CalendarDayScheduleSummary {
  return {
    id: "schedule-brown",
    school_id: "school-deloro",
    schedule_name: "Brown Day",
    schedule_type: "Regular",
    calendar_color: "#8B5E34",
    setup_status: "ready",
    active: true,
    ...overrides,
  };
}

function day(
  overrides: Partial<CalendarDayScheduleAssignment> = {}
): CalendarDayScheduleAssignment {
  return {
    school_id: "school-deloro",
    schedule_id: "schedule-brown",
    is_school_day: true,
    ...overrides,
  };
}

describe("calendar day schedule resolution", () => {
  it("resolves a ready schedule assigned to a calendar day", () => {
    const scheduleById = getScheduleByIdForSchool([schedule()], "school-deloro");

    expect(getAssignedScheduleForCalendarDay(day(), scheduleById)?.schedule_name).toBe(
      "Brown Day"
    );
  });

  it("resolves a needs_times schedule instead of treating it as unassigned", () => {
    const scheduleById = getScheduleByIdForSchool(
      [schedule({ id: "schedule-finals", schedule_name: "Finals", setup_status: "needs_times" })],
      "school-deloro"
    );

    expect(
      getAssignedScheduleForCalendarDay(
        day({ schedule_id: "schedule-finals" }),
        scheduleById
      )
    ).toMatchObject({
      schedule_name: "Finals",
      setup_status: "needs_times",
    });
  });

  it("resolves a zero-period schedule because periods are not required for assignment", () => {
    const scheduleById = getScheduleByIdForSchool(
      [schedule({ id: "schedule-minimum", schedule_name: "Minimum Day", setup_status: "needs_times" })],
      "school-deloro"
    );

    expect(
      getAssignedScheduleForCalendarDay(
        day({ schedule_id: "schedule-minimum" }),
        scheduleById
      )?.schedule_name
    ).toBe("Minimum Day");
  });

  it("resolves imported schedules created by AI Quick Setup", () => {
    const scheduleById = getScheduleByIdForSchool(
      [schedule({ id: "imported-brown", schedule_name: "Brown Day" })],
      "school-deloro"
    );

    expect(
      getAssignedScheduleForCalendarDay(
        day({ schedule_id: "imported-brown" }),
        scheduleById
      )?.schedule_name
    ).toBe("Brown Day");
  });

  it("resolves manually assigned schedules", () => {
    const scheduleById = getScheduleByIdForSchool(
      [schedule({ id: "manual-gold", schedule_name: "Gold Day", schedule_type: null })],
      "school-deloro"
    );

    const assigned = getAssignedScheduleForCalendarDay(
      day({ schedule_id: "manual-gold" }),
      scheduleById
    );

    expect(assigned?.schedule_name).toBe("Gold Day");
    expect(assigned ? getScheduleDisplayName(assigned) : null).toBe("Gold Day");
  });

  it("does not resolve a schedule for no-school days", () => {
    const scheduleById = getScheduleByIdForSchool([schedule()], "school-deloro");

    expect(
      getAssignedScheduleForCalendarDay(day({ is_school_day: false }), scheduleById)
    ).toBeNull();
  });

  it("enforces tenant isolation when mapping schedule assignments", () => {
    const scheduleById = getScheduleByIdForSchool(
      [schedule({ school_id: "school-north" })],
      "school-deloro"
    );

    expect(getAssignedScheduleForCalendarDay(day(), scheduleById)).toBeNull();
  });

  it("collects only assigned school-day schedule IDs for follow-up queries", () => {
    expect(
      getCalendarDayScheduleIds([
        day({ schedule_id: "schedule-brown" }),
        day({ schedule_id: "schedule-brown" }),
        day({ schedule_id: "schedule-gold" }),
        day({ schedule_id: null }),
        day({ schedule_id: "schedule-closed", is_school_day: false }),
      ])
    ).toEqual(["schedule-brown", "schedule-gold"]);
  });
});
