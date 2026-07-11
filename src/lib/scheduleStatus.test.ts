import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getScheduleSetupStatusForPeriods,
  normalizeScheduleSetupStatus,
  scheduleNeedsBellTimes,
} from "./scheduleStatus";

describe("schedule setup status", () => {
  it("ships a non-destructive migration that defaults schedules to ready", () => {
    const sql = readFileSync(
      join(process.cwd(), "sql/add_schedule_setup_status.sql"),
      "utf8"
    );

    expect(sql).toContain("add column if not exists setup_status text not null default 'ready'");
    expect(sql).toContain("check (setup_status in ('ready', 'needs_times'))");
  });

  it("ships an atomic AI calendar creation RPC", () => {
    const sql = readFileSync(
      join(process.cwd(), "sql/create_ai_calendar_from_draft.sql"),
      "utf8"
    );

    expect(sql).toContain("create or replace function public.create_ai_calendar_from_draft");
    expect(sql).toContain("security definer");
    expect(sql).toContain("delete from public.calendar_days");
    expect(sql).toContain("delete from public.calendar_wizard_drafts");
    expect(sql).toContain("grant execute");
  });


  it("defaults existing schedules to ready when the database value is ready", () => {
    expect(normalizeScheduleSetupStatus("ready")).toBe("ready");
  });

  it("marks empty AI-created schedules as needing bell times", () => {
    expect(normalizeScheduleSetupStatus("needs_times")).toBe("needs_times");
    expect(scheduleNeedsBellTimes("needs_times")).toBe(true);
  });

  it("derives ready status when valid periods exist", () => {
    expect(
      getScheduleSetupStatusForPeriods([
        {
          name: "Period 1",
          start_time: "08:30",
          end_time: "09:20",
        },
      ])
    ).toBe("ready");
  });

  it("derives needs_times when all periods are removed or incomplete", () => {
    expect(getScheduleSetupStatusForPeriods([])).toBe("needs_times");
    expect(
      getScheduleSetupStatusForPeriods([
        {
          name: "Period 1",
          start_time: "",
          end_time: "",
        },
      ])
    ).toBe("needs_times");
  });
});
