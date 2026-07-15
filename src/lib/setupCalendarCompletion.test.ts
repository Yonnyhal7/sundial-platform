import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeSetupCalendarStep,
  getScheduleSetupReadiness,
  hasPersistedInstructionalCalendarDays,
} from "./setupCalendarCompletion";
import { updateSchoolSetupStep } from "@/lib/schools";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/schools", () => ({
  updateSchoolSetupStep: vi.fn(),
}));

function createSupabaseStub({
  data,
  error = null,
}: {
  data: { id: string } | null;
  error?: { message: string } | null;
}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };

  return {
    from: vi.fn(() => builder),
    builder,
  };
}

function createReadinessSupabaseStub({
  dayRefs = [],
  schedules = [],
  periods = [],
}: {
  dayRefs?: Array<{ schedule_id: string | null; base_schedule_id: string | null }>;
  schedules?: Array<{
    id: string;
    schedule_name: string;
    setup_status: string | null;
    active: boolean | null;
  }>;
  periods?: Array<{
    schedule_id: string;
    name: string;
    start_time: string;
    end_time: string;
  }>;
}) {
  const builders: Record<string, { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn>; returns: ReturnType<typeof vi.fn> }> = {};
  const tableData = {
    calendar_days: dayRefs,
    schedules,
    periods,
  };

  const supabase = {
    from: vi.fn((table: keyof typeof tableData) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: tableData[table], error: null })),
      };
      builders[table] = builder;
      return builder;
    }),
    builders,
  };

  return supabase;
}

describe("setup calendar completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies at least one instructional calendar day exists", async () => {
    const supabase = createSupabaseStub({ data: { id: "day-1" } });

    await expect(
      hasPersistedInstructionalCalendarDays(supabase as never, "school-1")
    ).resolves.toBe(true);

    expect(supabase.from).toHaveBeenCalledWith("calendar_days");
    expect(supabase.builder.eq).toHaveBeenCalledWith("school_id", "school-1");
    expect(supabase.builder.eq).toHaveBeenCalledWith("is_school_day", true);
  });

  it("does not complete setup without instructional calendar days", async () => {
    const supabase = createReadinessSupabaseStub({});

    const result = await completeSetupCalendarStep({
      supabase: supabase as never,
      schoolId: "school-1",
      school: "deloro",
    });

    expect(result.status).toBe("validation_error");
    if (result.status === "validation_error") {
      expect(result.reason).toBe("missing_calendar");
    }
    expect(updateSchoolSetupStep).not.toHaveBeenCalled();
  });

  it("marks the Schedule Wizard step complete after persisted calendar verification", async () => {
    const supabase = createReadinessSupabaseStub({
      dayRefs: [{ schedule_id: "schedule-1", base_schedule_id: "schedule-1" }],
      schedules: [
        {
          id: "schedule-1",
          schedule_name: "Regular Day",
          setup_status: "ready",
          active: true,
        },
      ],
      periods: [
        {
          schedule_id: "schedule-1",
          name: "Period 1",
          start_time: "08:00",
          end_time: "08:50",
        },
      ],
    });

    const result = await completeSetupCalendarStep({
      supabase: supabase as never,
      schoolId: "school-1",
      school: "deloro",
    });

    expect(result.status).toBe("success");
    expect(updateSchoolSetupStep).toHaveBeenCalledWith(
      supabase,
      "school-1",
      "complete"
    );
  });

  it("keeps Launch locked when a referenced schedule needs bell times", async () => {
    const supabase = createReadinessSupabaseStub({
      dayRefs: [{ schedule_id: "schedule-1", base_schedule_id: "schedule-1" }],
      schedules: [
        {
          id: "schedule-1",
          schedule_name: "Finals",
          setup_status: "needs_times",
          active: true,
        },
      ],
    });

    const result = await completeSetupCalendarStep({
      supabase: supabase as never,
      schoolId: "school-1",
      school: "deloro",
    });

    expect(result.status).toBe("validation_error");
    if (result.status === "validation_error") {
      expect(result.reason).toBe("schedules_need_times");
      expect(result.schedulesNeedingTimes).toEqual([
        { id: "schedule-1", name: "Finals" },
      ]);
    }
    expect(updateSchoolSetupStep).not.toHaveBeenCalled();
  });

  it("reports schedule readiness complete after remaining bell times are added", async () => {
    const supabase = createReadinessSupabaseStub({
      dayRefs: [{ schedule_id: "schedule-1", base_schedule_id: "schedule-1" }],
      schedules: [
        {
          id: "schedule-1",
          schedule_name: "Finals",
          setup_status: "ready",
          active: true,
        },
      ],
      periods: [
        {
          schedule_id: "schedule-1",
          name: "Final",
          start_time: "08:00",
          end_time: "10:00",
        },
      ],
    });

    await expect(
      getScheduleSetupReadiness(supabase as never, "school-1")
    ).resolves.toMatchObject({
      complete: true,
      hasInstructionalCalendarDays: true,
      schedulesNeedingTimes: [],
    });
  });
});
