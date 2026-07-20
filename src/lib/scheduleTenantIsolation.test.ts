import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchDetectedSchedules } from "./calendarWizard/aiScheduleMatching";
import {
  collectStoredDraftScheduleIds,
  findForeignScheduleIds,
} from "./calendarWizard/tenantIsolation";
import { serializeCalendarWizardDraft } from "./calendarWizard/draftPersistence";

const schoolAId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const schoolBId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const schoolAScheduleId = "11111111-1111-4111-8111-111111111111";
const schoolBScheduleId = "22222222-2222-4222-8222-222222222222";

function storedDraft(scheduleId: string) {
  const serialized = serializeCalendarWizardDraft({
    currentStep: "normal-schedule",
    draft: {
      schoolYear: {
        label: "2026-2027",
        startDate: "2026-08-12",
        endDate: "2027-06-03",
        operatingWeekdays: [1, 2, 3, 4, 5],
      },
      patternMode: "same",
      sameScheduleId: scheduleId,
      repeatingScheduleIds: [],
      weekdaySchedules: {},
      noSchoolRanges: [],
      specialDays: [],
      informationalDates: [],
      completedSteps: ["normal-schedule"],
      aiImport: null,
    },
  });

  if (!serialized) throw new Error("Test draft failed to serialize");
  return serialized.data;
}

describe("schedule tenant isolation", () => {
  it("ships fail-fast ownership checks and tenant-composite foreign keys", () => {
    const sql = readFileSync(
      join(process.cwd(), "sql/enforce_schedule_tenant_isolation.sql"),
      "utf8"
    );

    expect(sql).toContain("Schedule tenant isolation audit failed");
    expect(sql).toContain("alter column school_id set not null");
    expect(sql).toContain("foreign key (schedule_id, school_id)");
    expect(sql).toContain("foreign key (base_schedule_id, school_id)");
    expect(sql).toContain("schedules_id_school_id_key");
    expect(sql).toContain("periods_schedule_school_fkey");
  });

  it("replaces permissive legacy policies with school-aware RLS", () => {
    const sql = readFileSync(
      join(process.cwd(), "sql/enforce_schedule_tenant_isolation.sql"),
      "utf8"
    );

    expect(sql).toContain("from pg_policies");
    expect(sql).toContain("current_user_can_access_school(school_id)");
    expect(sql).toContain("current_user_can_manage_school_section(school_id, 'schedules')");
    expect(sql).toContain("current_user_can_manage_school_section(school_id, 'calendar')");
    expect(sql).toContain("to anon");
    expect(sql).toContain("to authenticated");
  });

  it("allows the same schedule name in two independently owned schools", () => {
    const records = [
      { id: schoolAScheduleId, school_id: schoolAId, schedule_name: "Regular Schedule" },
      { id: schoolBScheduleId, school_id: schoolBId, schedule_name: "Regular Schedule" },
    ];

    expect(records.filter((record) => record.school_id === schoolAId)).toEqual([
      records[0],
    ]);
    expect(records.filter((record) => record.school_id === schoolBId)).toEqual([
      records[1],
    ]);
  });

  it("matches AI schedule names only against the caller's school-scoped candidates", () => {
    const detected = [
      {
        tempId: "regular",
        detectedName: "Regular Schedule",
        normalizedName: "regular",
        category: "regular" as const,
        confidence: "high" as const,
        needsSetup: false,
      },
    ];

    const [schoolAResult] = matchDetectedSchedules(detected, [
      { id: schoolAScheduleId, name: "Regular Schedule" },
    ]);
    const [newSchoolResult] = matchDetectedSchedules(detected, []);

    expect(schoolAResult.matchedExistingScheduleId).toBe(schoolAScheduleId);
    expect(newSchoolResult.matchedExistingScheduleId).toBeNull();
    expect(newSchoolResult.status).toBe("needs_times");
  });

  it("detects a foreign schedule ID in a submitted wizard draft", () => {
    const referenced = collectStoredDraftScheduleIds(storedDraft(schoolBScheduleId));

    expect(findForeignScheduleIds(referenced, [schoolAScheduleId])).toEqual([
      schoolBScheduleId,
    ]);
    expect(findForeignScheduleIds(referenced, [schoolBScheduleId])).toEqual([]);
  });

  it("hardens the AI RPC with a school lock and school-scoped matching", () => {
    const sql = readFileSync(
      join(process.cwd(), "sql/create_ai_calendar_from_draft.sql"),
      "utf8"
    );

    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("s.school_id = p_school_id");
    expect(sql).toContain("d.school_id = p_school_id");
    expect(sql).toContain("calendar row references a schedule outside this school");
  });

  it("keeps school creation blank instead of seeding schedules", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/admin/dashboard/schools/actions.ts"),
      "utf8"
    );

    expect(source).toContain('rpc("create_school_with_platform_defaults"');
    expect(source).not.toContain('.from("schedules")');
    expect(source).not.toContain('.from("periods")');
    expect(source).not.toContain('.from("calendar_days")');
  });
});
