import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260717213000_reconcile_ai_calendar_rpc_overloads.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const digestMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260716143000_verify_ai_calendar_assignment_payload.sql"
  ),
  "utf8"
);
const actions = readFileSync(
  resolve(process.cwd(), "src/app/[school]/admin/calendar/wizard/actions.ts"),
  "utf8"
);

function canonicalSqlArguments() {
  const match = migration.match(
    /create function public\.create_available_ai_calendar_from_draft\(([\s\S]*?)\)\s*returns jsonb/i
  );
  expect(match).not.toBeNull();
  return match![1]
    .split(",")
    .map((argument) => argument.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((argument) => {
      const [name, ...type] = argument.split(" ");
      return { name, type: type.join(" ") };
    });
}

function serverRpcArgumentNames() {
  const rpcStart = actions.indexOf('"create_available_ai_calendar_from_draft"');
  const rpcEnd = actions.indexOf("if (rpcError)", rpcStart);
  expect(rpcStart).toBeGreaterThanOrEqual(0);
  expect(rpcEnd).toBeGreaterThan(rpcStart);
  return [...actions.slice(rpcStart, rpcEnd).matchAll(/^\s+(p_[a-z_]+):/gm)].map(
    (match) => match[1]
  );
}

function droppedSqlIdentities() {
  return [
    ...migration.matchAll(
      /drop function if exists public\.create_available_ai_calendar_from_draft\(([\s\S]*?)\);/gi
    ),
  ].map((match) => match[1].trim().replace(/\s+/g, " "));
}

describe("AI calendar creation RPC contract", () => {
  it("matches the server action argument object to the one canonical SQL signature", () => {
    const sqlArguments = canonicalSqlArguments();
    expect(serverRpcArgumentNames()).toEqual(
      sqlArguments.map((argument) => argument.name)
    );
    expect(sqlArguments).toEqual([
      { name: "p_school_id", type: "uuid" },
      { name: "p_draft_id", type: "uuid" },
      { name: "p_expected_draft_updated_at", type: "timestamp with time zone" },
      { name: "p_start_date", type: "date" },
      { name: "p_end_date", type: "date" },
      { name: "p_replace_existing", type: "boolean" },
      { name: "p_schedules", type: "jsonb" },
      { name: "p_calendar_days", type: "jsonb" },
      { name: "p_review", type: "jsonb" },
      { name: "p_count_review", type: "jsonb" },
    ]);
  });

  it("drops all three deployed overloads and leaves one authenticated contract", () => {
    expect(droppedSqlIdentities()).toEqual([
      "uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb",
      "uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb, jsonb",
      "uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb, jsonb, jsonb",
    ]);
    expect(migration).toContain("if v_count <> 1");
    expect(migration).toContain("or v_argument_count <> 10");
    expect(migration).toContain("or v_argument_names[9] <> 'p_review'");
    expect(migration).toContain("or v_argument_names[10] <> 'p_count_review'");
    expect(migration).toContain("or v_authenticated_execute is not true");
    expect(migration).toContain("or v_anon_execute is not false");
    expect(migration).toContain("or v_public_execute is not false");
    expect(migration).toContain(") from public, anon, authenticated;");
    expect(migration).toContain(") to authenticated;");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema';");
  });

  it("preserves delegated calendar creation, audits, count enforcement, and rollback", () => {
    expect(migration).toContain("v_result := public.create_ai_calendar_from_draft(");
    expect(digestMigration).toContain("calendar_assignment_digest_mismatch");
    expect(digestMigration).toContain("public.create_ai_calendar_from_draft_unchecked(");
    expect(migration).toContain("insert into public.ai_calendar_import_reviews");
    expect(migration).toContain("insert into public.ai_calendar_instructional_count_reviews");
    expect(migration).toContain("The instructional-day count review is required.");
    expect(migration).toContain("p_count_review->>'classification_digest'");
    expect(migration).toContain("and d.school_id = p_school_id");
    expect(migration).toContain(`exception
  when others then
    raise;`);
  });
});
