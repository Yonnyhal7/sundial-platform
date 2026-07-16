import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI calendar assignment payload migration", () => {
  it("rolls back atomically when saved calendar rows differ from the creation payload", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260716143000_verify_ai_calendar_assignment_payload.sql"),
      "utf8"
    );
    expect(sql).toContain("calendar_assignment_digest_mismatch");
    expect(sql).toContain("full join actual using (date)");
    expect(sql).toContain("firstDifferingDates");
    expect(sql).toContain("raise exception");
  });
});
