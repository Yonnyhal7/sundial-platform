import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716060000_ai_calendar_progress_schema_sync.sql"
  ),
  "utf8"
);

describe("AI calendar analysis progress schema sync migration", () => {
  it("contains every column written by stage persistence", () => {
    for (const column of [
      "analysis_strategy",
      "status",
      "current_stage",
      "stage_strategy",
      "request_id",
      "reason_code",
      "updated_at",
      "finished_at",
      "last_heartbeat_at",
      "analysis_version",
      "invalidated_at",
      "invalidated_by",
      "invalidation_reason",
    ]) {
      expect(migration).toContain(`add column if not exists ${column}`);
    }
  });

  it("keeps the current cache conflict target valid", () => {
    expect(migration).toContain("drop constraint if exists ai_calendar_analysis_cache_pkey");
    expect(migration).toContain("add constraint ai_calendar_analysis_cache_pkey");
    expect(migration).toContain("analysis_strategy");
    expect(migration).toContain("prompt_schema_version");
  });

  it("reloads the PostgREST schema cache after adding progress columns", () => {
    expect(migration.toLowerCase()).toContain("notify pgrst, 'reload schema'");
  });

  it("allows the PDF-specific timeout failure reason in cache invalidation metadata", () => {
    expect(migration).toContain("'pdf_analysis_timeout'");
  });
});
