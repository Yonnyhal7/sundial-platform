import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeSetupCalendarStep,
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
    const supabase = createSupabaseStub({ data: null });

    const result = await completeSetupCalendarStep({
      supabase: supabase as never,
      schoolId: "school-1",
      school: "deloro",
    });

    expect(result.status).toBe("validation_error");
    expect(updateSchoolSetupStep).not.toHaveBeenCalled();
  });

  it("marks the Schedule Wizard step complete after persisted calendar verification", async () => {
    const supabase = createSupabaseStub({ data: { id: "day-1" } });

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
});
