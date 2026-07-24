import { describe, expect, it } from "vitest";
import { getCalendarDayAccessibleLabel } from "@/lib/calendarDayAccessibility";

function createDay(
  overrides: Partial<Parameters<typeof getCalendarDayAccessibleLabel>[0]> = {}
) {
  return {
    longDateLabel: "August 3, 2026",
    isToday: false,
    isSelected: false,
    isSchoolDay: true,
    scheduleName: "Gold Day",
    scheduleType: "standard",
    label: null,
    ...overrides,
  };
}

describe("getCalendarDayAccessibleLabel", () => {
  it("identifies the full date and assigned schedule without relying on color", () => {
    expect(getCalendarDayAccessibleLabel(createDay())).toBe(
      "August 3, 2026. Gold Day, standard"
    );
  });

  it("announces today and the selected state", () => {
    expect(
      getCalendarDayAccessibleLabel(
        createDay({ isToday: true, isSelected: true })
      )
    ).toBe("August 3, 2026. Today. Gold Day, standard. Selected");
  });

  it("announces a labeled no-school day", () => {
    expect(
      getCalendarDayAccessibleLabel(
        createDay({
          isSchoolDay: false,
          scheduleName: null,
          scheduleType: null,
          label: "Staff Development Day",
        })
      )
    ).toBe("August 3, 2026. Staff Development Day");
  });

  it("announces when no schedule is assigned", () => {
    expect(
      getCalendarDayAccessibleLabel(
        createDay({ scheduleName: null, scheduleType: null })
      )
    ).toBe("August 3, 2026. No schedule assigned");
  });
});
