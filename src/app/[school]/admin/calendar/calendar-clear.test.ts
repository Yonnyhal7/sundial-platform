import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const action = read("src/app/[school]/admin/calendar/actions.ts");
const client = read("src/app/[school]/admin/calendar/calendar-client.tsx");
const calendar = read("src/components/admin/SchoolCalendar.tsx");
const publicCalendar = read("src/lib/publicCalendar.ts");

describe("admin calendar day clearing", () => {
  it("authorizes against the resolved tenant and deletes only the selected date", () => {
    expect(action).toContain("get_available_school_by_subdomain");
    expect(action).toContain('requireAdminSectionAccess(schoolData.id, "calendar", school)');
    expect(action).toContain('.from("calendar_days")');
    expect(action).toContain(".delete()");
    expect(action).toContain('.eq("school_id", schoolData.id)');
    expect(action).toContain('.eq("date", date)');
    expect(action).not.toContain('.from("schedules").delete');
    expect(action).not.toContain('.from("events").delete');
  });

  it("shows the clear action only for persisted dates and confirms before deletion", () => {
    expect(client).toContain("selectedCalendarDay && <button");
    expect(client).toContain("Clear Calendar Day");
    expect(client).toContain('role="dialog"');
    expect(client).toContain('aria-modal="true"');
    expect(client).toContain("Clear Day");
    expect(client).toContain("Cancel");
    expect(client).toContain('event.key !== "Escape"');
  });

  it("removes the marker only after success and preserves failure state", () => {
    const successGuard = client.indexOf('result.status !== "success"');
    const localRemoval = client.indexOf("setClearedDates", successGuard);
    expect(successGuard).toBeGreaterThan(-1);
    expect(localRemoval).toBeGreaterThan(successGuard);
    expect(client).toContain("router.refresh()");
    expect(client).toContain('role={clearMessage.status === "error" ? "alert" : "status"}');
  });

  it("keeps the school-day toggle, schedule selector, and warning consistent", () => {
    expect(client).toContain("calendarDay?.is_school_day ?? naturalSchoolDay(dateString)");
    expect(client).toContain("if (e.target.value) setIsSchoolDay(true)");
    expect(client).toContain("disabled={!isSchoolDay}");
    expect(client).toContain('setSelectedScheduleId("")');
    expect(client).toContain("when saved. No bell schedule will be shown.");
  });

  it("shares meaningful marker semantics across admin and public models", () => {
    expect(calendar).toContain("hasMeaningfulCalendarDayStatus");
    expect(calendar).toContain("isWeekend && !hasMeaningfulStatus");
    expect(calendar).toContain("hasMeaningfulStatus || day.hasConflict");
    expect(publicCalendar).toContain("hasMeaningfulCalendarDayStatus");
    expect(publicCalendar).toContain("hasMeaningfulStatus:");
  });
});
