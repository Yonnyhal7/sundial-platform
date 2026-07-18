import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260717223000_create_ai_calendar_import_review_audit.sql"
  ),
  "utf8"
);
const actions = readFileSync(
  resolve(process.cwd(), "src/app/[school]/admin/calendar/wizard/actions.ts"),
  "utf8"
);
const serializer = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/calendarWizard/aiCalendarReviewAuditPayload.ts"
  ),
  "utf8"
);
const digestMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260716143000_verify_ai_calendar_assignment_payload.sql"
  ),
  "utf8"
);
const tenantMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260713120000_enforce_schedule_tenant_isolation.sql"
  ),
  "utf8"
);

const requiredAuditColumns = [
  "id",
  "school_id",
  "draft_id",
  "analysis_attempt_id",
  "declared_instructional_count",
  "generated_instructional_count",
  "final_instructional_count",
  "count_review_status",
  "final_classifications",
  "classification_digest",
  "acknowledged_issue_codes",
  "review_note",
  "reviewed_by",
  "reviewed_at",
  "analysis_version",
  "created_at",
  "updated_at",
] as const;

function extractColumnList(pattern: RegExp) {
  const match = migration.match(pattern);
  expect(match).not.toBeNull();
  return match![1]
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
}

describe("AI calendar import review audit contract", () => {
  it("creates every required audit field with the derived SQL types", () => {
    expect(migration).toContain("create table if not exists public.ai_calendar_import_reviews (");
    const expectedTypes = new Map<string, string>([
      ["id", "uuid"],
      ["school_id", "uuid"],
      ["draft_id", "uuid"],
      ["analysis_attempt_id", "uuid"],
      ["declared_instructional_count", "integer"],
      ["generated_instructional_count", "integer"],
      ["final_instructional_count", "integer"],
      ["count_review_status", "text"],
      ["final_classifications", "jsonb"],
      ["classification_digest", "text"],
      ["acknowledged_issue_codes", "text[]"],
      ["review_note", "text"],
      ["reviewed_by", "uuid"],
      ["reviewed_at", "timestamp with time zone"],
      ["analysis_version", "text"],
      ["created_at", "timestamp with time zone"],
      ["updated_at", "timestamp with time zone"],
    ]);
    for (const column of requiredAuditColumns) {
      expect(migration).toMatch(
        new RegExp(`\\n  ${column} ${expectedTypes.get(column)!.replace("[]", "\\[\\]")}(?:[ ,\\n])`)
      );
    }
  });

  it("keeps the canonical RPC insert aligned with the table audit contract", () => {
    const insertedColumns = extractColumnList(
      /insert into public\.ai_calendar_import_reviews \(([\s\S]*?)\n  \) values/i
    );
    expect(insertedColumns).toEqual(
      requiredAuditColumns.filter(
        (column) => !["id", "created_at", "updated_at"].includes(column)
      )
    );
    expect(actions).toContain("serializeAiCalendarReviewAuditPayload({");
    expect(serializer).toContain("analysis_attempt_id: analysisAttemptId || null");
    expect(serializer).toContain("analysis_version: analysisVersion || null");
    expect(serializer).toContain("classification_digest: classificationDigest || null");
    expect(migration).toContain("p_count_review->>'review_status'");
    expect(migration).toContain("coalesce(p_count_review->'classifications', '[]'::jsonb)");
  });

  it("keeps calendar creation and review auditing in one rollback boundary", () => {
    const delegatedCall = migration.indexOf("v_result := public.create_ai_calendar_from_draft(");
    const auditInsert = migration.indexOf("insert into public.ai_calendar_import_reviews (");
    const successReturn = migration.indexOf("return v_result;", auditInsert);
    expect(delegatedCall).toBeGreaterThanOrEqual(0);
    expect(auditInsert).toBeGreaterThan(delegatedCall);
    expect(successReturn).toBeGreaterThan(auditInsert);
    expect(migration).toContain(`exception
  when others then
    -- The review insert is part of the same transaction as schedule/calendar
    -- creation. Any audit failure rolls all delegated writes back.
    raise;`);
    expect(digestMigration).toContain("calendar_assignment_digest_mismatch");
    expect(migration).toContain("The instructional-day count review is required.");
  });

  it("enforces tenant-scoped reads and RPC-only authenticated writes", () => {
    expect(migration).toContain("school_id uuid not null references public.schools(id) on delete cascade");
    expect(migration).toContain("reviewed_by uuid not null references public.users(id)");
    expect(migration).toContain("alter table public.ai_calendar_import_reviews enable row level security;");
    expect(migration).toContain("current_user_can_manage_school_section(school_id, 'calendar')");
    expect(tenantMigration).toContain("lower(coalesce(u.role, '')) in ('super_admin', 'superadmin')");
    expect(migration).toContain("revoke all on public.ai_calendar_import_reviews from public, anon, authenticated;");
    expect(migration).toContain("grant select on public.ai_calendar_import_reviews to authenticated;");
    expect(migration).toContain("grant all on public.ai_calendar_import_reviews to service_role;");
    expect(migration).toContain(") from public, anon, authenticated;");
    expect(migration).toContain(") to authenticated;");
  });

  it("indexes the audit lookups without attaching deleted drafts as foreign keys", () => {
    expect(migration).toContain("ai_calendar_import_reviews_school_id_idx");
    expect(migration).toContain("ai_calendar_import_reviews_draft_id_idx");
    expect(migration).toContain("ai_calendar_import_reviews_analysis_attempt_id_idx");
    expect(migration).toContain("ai_calendar_import_reviews_reviewed_at_idx");
    expect(migration).toContain("ai_calendar_import_reviews_school_attempt_idx");
    expect(migration).toContain("ai_calendar_import_reviews_school_attempt_uidx");
    expect(migration).not.toMatch(/draft_id uuid[^\n]*references public\.calendar_wizard_drafts/);
    expect(migration).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
