import { describe, expect, it } from "vitest";
import { buildPublicCalendarViewModel, getMonthGridDateStrings, shiftMonthKey } from "@/lib/publicCalendar";

const school = { id: "school-a", slug: "north", name: "North High", timezone: "America/Los_Angeles" };
const schedule = { id: "schedule-a", school_id: school.id, schedule_name: "Gold Schedule With A Long Name", schedule_type: "special", calendar_color: "#D4A017", setup_status: "ready", active: true };

describe("public calendar view model", () => {
  it("builds complete Sunday-through-Saturday month grids and navigates months", () => {
    const august = getMonthGridDateStrings("2026-08");
    expect(august[0]).toBe("2026-07-26");
    expect(august.at(-1)).toBe("2026-09-05");
    expect(august).toHaveLength(42);
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
  });

  it("maps school days, no-school reasons, special labels, periods, and events", () => {
    const result = buildPublicCalendarViewModel({
      school,
      today: "2026-08-18",
      calendarDays: [
        { id: "day-1", school_id: school.id, date: "2026-08-18", label: "Welcome Day", is_school_day: true, schedule_id: schedule.id },
        { id: "day-2", school_id: school.id, date: "2026-09-07", label: "Labor Day", is_school_day: false, schedule_id: null },
      ],
      schedules: [schedule],
      periods: [
        { id: "period-2", school_id: school.id, schedule_id: schedule.id, name: "Lunch", start_time: "10:50:00", end_time: "11:25:00", sort_order: 2 },
        { id: "period-1", school_id: school.id, schedule_id: schedule.id, name: "Period 1", start_time: "08:00:00", end_time: "09:20:00", sort_order: 1 },
      ],
      events: [{ id: "event-1", school_id: school.id, title: "Back to School Night", location: "Gym", event_date: "2026-08-18", start_time: "18:00:00", end_time: null }],
    });

    expect(result.academicYear).toEqual({ startDate: "2026-08-18", endDate: "2026-09-07", label: "2026" });
    expect(result.days[0]).toMatchObject({ scheduleName: schedule.schedule_name, scheduleType: "special", label: "Welcome Day" });
    expect(result.days[0].periods.map((period) => period.name)).toEqual(["Period 1", "Lunch"]);
    expect(result.days[0].events[0].title).toBe("Back to School Night");
    expect(result.days[1]).toMatchObject({ isSchoolDay: false, label: "Labor Day", scheduleName: null });
  });

  it("rejects cross-tenant schedules, periods, calendar days, and events", () => {
    const result = buildPublicCalendarViewModel({
      school,
      today: "2026-08-18",
      calendarDays: [
        { id: "owned", school_id: school.id, date: "2026-08-18", label: null, is_school_day: true, schedule_id: "foreign-schedule" },
        { id: "foreign", school_id: "school-b", date: "2026-08-19", label: "Foreign", is_school_day: true, schedule_id: "foreign-schedule" },
      ],
      schedules: [{ ...schedule, id: "foreign-schedule", school_id: "school-b" }],
      periods: [{ id: "foreign-period", school_id: "school-b", schedule_id: "foreign-schedule", name: "Secret", start_time: "08:00:00", end_time: "09:00:00", sort_order: 1 }],
      events: [{ id: "foreign-event", school_id: "school-b", title: "Foreign event", location: null, event_date: "2026-08-18", start_time: null, end_time: null }],
    });

    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toMatchObject({ date: "2026-08-18", scheduleName: null, periods: [], events: [] });
  });

  it("represents schedules with unpublished bell times without internal status copy", () => {
    const result = buildPublicCalendarViewModel({
      school,
      today: "2026-08-18",
      calendarDays: [{ id: "day", school_id: school.id, date: "2026-08-18", label: null, is_school_day: true, schedule_id: schedule.id }],
      schedules: [{ ...schedule, setup_status: "needs_times" }],
      periods: [],
      events: [],
    });
    expect(result.days[0]).toMatchObject({ scheduleName: schedule.schedule_name, scheduleSetupStatus: "needs_times", periods: [] });
  });
});
