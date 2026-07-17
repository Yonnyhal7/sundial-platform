import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(
  resolve(process.cwd(), "src/app/[school]/admin/calendar/wizard/actions.ts"),
  "utf8"
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260717150000_ai_calendar_instructional_count_review.sql"),
  "utf8"
);

describe("AI instructional count review persistence", () => {
  it("enforces review readiness again in the server action", () => {
    expect(actions).toContain("getInstructionalDayCountReviewState(");
    expect(actions).toContain("Review the instructional-day count difference before creating the calendar.");
    expect(actions).toContain("previewClassificationDigest");
    expect(actions).toContain("p_count_review:");
  });

  it("stores separate declared, generated, and final counts with reviewer audit fields", () => {
    expect(migration).toContain("declared_instructional_day_count integer not null");
    expect(migration).toContain("generated_instructional_day_count integer not null");
    expect(migration).toContain("final_approved_instructional_day_count integer not null");
    expect(migration).toContain("reviewed_by uuid not null references public.users(id)");
    expect(migration).toContain("reviewed_at timestamptz not null");
  });

  it("keeps count-review persistence tenant scoped", () => {
    expect(migration).toContain("school_id uuid not null references public.schools(id) on delete cascade");
    expect(migration).toContain("current_user_can_manage_school_section(school_id, 'calendar')");
    expect(migration).toContain("p_school_id");
    expect(migration).toContain("auth.uid()");
  });
});
