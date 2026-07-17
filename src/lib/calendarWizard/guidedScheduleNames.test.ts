import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const actions = read("src/app/[school]/admin/calendar/wizard/actions.ts");
const wizard = read("src/app/[school]/admin/calendar/wizard/schedule-wizard-client.tsx");
const schedulesPage = read("src/app/[school]/admin/schedules/page.tsx");
const setupCompletion = read("src/lib/setupCalendarCompletion.ts");
const scheduleEditor = read("src/app/[school]/admin/schedules/[scheduleId]/edit/actions.ts");

describe("guided name-only schedules", () => {
  it("creates an active needs_times schedule without creating periods", () => {
    const start = actions.indexOf("export async function createGuidedScheduleName");
    const end = actions.indexOf("export async function renameGuidedScheduleName");
    const createAction = actions.slice(start, end);

    expect(createAction).toContain('active: true');
    expect(createAction).toContain('setup_status: "needs_times"');
    expect(createAction).toContain('school_id: schoolData.id');
    expect(createAction).not.toContain('.from("periods")');
  });

  it("normalizes and rejects duplicate names within the current school", () => {
    expect(actions).toContain('value.trim().replace(/\\s+/g, " ")');
    expect(actions).toContain('.eq("school_id", schoolId)');
    expect(actions).toContain('toLocaleLowerCase("en-US")');
    expect(actions).toContain("A schedule with this name already exists in this school.");
  });

  it("makes newly created schedules immediately selectable and editable", () => {
    expect(wizard).toContain("setSchedules((current) => [...current, schedule]");
    expect(wizard).toContain("+ Create New Schedule");
    expect(wizard).toContain("Add Schedule Name");
    expect(wizard).toContain("renameGuidedScheduleName");
    expect(wizard).toContain("deleteUnusedGuidedScheduleName");
    expect(wizard).toContain("draftUsesSchedule(draft, scheduleId)");
  });

  it("shows missing times as non-blocking review guidance", () => {
    expect(wizard).toContain("Schedules to finish later");
    expect(wizard).toContain("These schedules can be used to create your calendar now.");
    expect(wizard).toContain('schedule.setupStatus === "needs_times" ? " · Needs bell times"');
  });

  it("completes setup from generated instructional days rather than periods", () => {
    expect(setupCompletion).toContain("hasPersistedInstructionalCalendarDays");
    expect(setupCompletion).toContain("complete: true");
    expect(setupCompletion).toContain("schedulesNeedingTimes");
  });

  it("offers Add Periods later and marks a schedule ready after valid periods", () => {
    expect(schedulesPage).toContain("Needs bell times");
    expect(schedulesPage).toContain("Add Periods");
    expect(schedulesPage).toContain("/edit");
    expect(scheduleEditor).toContain('setup_status: hasValidPeriods ? "ready" : "needs_times"');
  });
});
