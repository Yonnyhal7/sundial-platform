import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const reconciliationPath =
  "supabase/migrations/20260724105500_reconcile_school_timezone_management.sql";

describe("timezone migration reconciliation contract", () => {
  it("runs after the grant reconciliation and before notification foundation", () => {
    expect(20260724105000).toBeLessThan(20260724105500);
    expect(20260724105500).toBeLessThan(20260724110000);
  });

  it("does not replay already-present tables, columns, indexes, policies, or table grants", () => {
    const sql = read(reconciliationPath);

    expect(sql).not.toMatch(/\b(?:create|alter|drop)\s+table\b/i);
    expect(sql).not.toMatch(/\b(?:create|alter|drop)\s+(?:unique\s+)?index\b/i);
    expect(sql).not.toMatch(/\b(?:create|alter|drop)\s+policy\b/i);
    expect(sql).not.toMatch(/\bgrant\s+(?:select|insert|update|delete|all)\s+on\s+(?:table\s+)?/i);
    expect(sql).not.toMatch(/\brevoke\s+.+\s+on\s+(?:table\s+)?public\./i);
  });

  it("centralizes strict supported-IANA validation and enforces it on direct writes", () => {
    const sql = read(reconciliationPath);

    expect(sql).toContain("create or replace function public.school_timezone_is_supported");
    expect(sql).toContain("from pg_catalog.pg_timezone_names");
    expect(sql).toContain("p_timezone not like 'Etc/GMT%'");
    expect(sql).toContain("p_timezone not like 'US/%'");
    expect(sql).toContain("length(p_timezone) <= 100");
    expect(sql).toContain("create or replace function public.enforce_supported_school_timezone");
    expect(sql).toContain("before insert or update of timezone on public.schools");
    expect(sql).toContain("errcode = '22023'");
  });

  it("keeps helpers private and RPC execution limited to authenticated callers", () => {
    const sql = read(reconciliationPath);

    expect(sql).toMatch(
      /revoke all on function public\.school_timezone_is_supported\(text\)[\s\S]*from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /revoke all on function public\.enforce_supported_school_timezone\(\)[\s\S]*from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /revoke all on function public\.update_platform_settings\(text, bigint, jsonb\)[\s\S]*from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.update_platform_settings\(text, bigint, jsonb\)[\s\S]*to authenticated/i
    );
    expect(sql).toMatch(
      /revoke all on function public\.update_school_timezone\([\s\S]*\)[\s\S]*from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.update_school_timezone\([\s\S]*\)[\s\S]*to authenticated/i
    );
  });

  it("uses safe search paths for every security-definer function", () => {
    const sql = read(reconciliationPath);
    const securityDefinerFunctions = sql
      .split(/create or replace function /i)
      .slice(1)
      .filter((definition) => /security definer/i.test(definition));

    expect(securityDefinerFunctions).toHaveLength(3);
    for (const definition of securityDefinerFunctions) {
      expect(definition).toMatch(/set search_path = public, pg_temp/i);
    }
    expect(sql).toMatch(
      /school_timezone_is_supported\(p_timezone text\)[\s\S]*set search_path = pg_catalog/i
    );
  });

  it("keeps platform timezone changes SuperAdmin-only", () => {
    const sql = read(reconciliationPath);
    const platformRpc = sql.slice(
      sql.indexOf("create or replace function public.update_platform_settings"),
      sql.indexOf("create or replace function public.update_school_timezone")
    );

    expect(platformRpc).toContain("public.current_user_is_super_admin()");
    expect(platformRpc).toContain(
      "not public.school_timezone_is_supported(p_values->>'default_timezone')"
    );
    expect(platformRpc).toContain("return jsonb_build_object('status', 'permission_error')");
  });

  it("authorizes only SuperAdmin or the active SchoolAdmin membership for the target school", () => {
    const sql = read(reconciliationPath);
    const schoolRpc = sql.slice(
      sql.indexOf("create or replace function public.update_school_timezone")
    );

    expect(schoolRpc).toContain("membership.school_id = p_school_id");
    expect(schoolRpc).toContain("membership.role = 'SchoolAdmin'");
    expect(schoolRpc).toContain("membership.is_active is true");
    expect(schoolRpc).not.toContain("membership.role = 'Editor'");
    expect(schoolRpc).toContain("actor.school_id = p_school_id");
    expect(schoolRpc).toContain("actor.is_active is true");
  });

  it("rejects archived, unconfirmed, stale, and invalid changes with audit records", () => {
    const sql = read(reconciliationPath);
    const schoolRpc = sql.slice(
      sql.indexOf("create or replace function public.update_school_timezone")
    );

    for (const status of [
      "school_unavailable",
      "confirmation_required",
      "stale",
      "invalid_timezone",
    ]) {
      const statusIndex = schoolRpc.indexOf(`'${status}'`);
      expect(statusIndex).toBeGreaterThan(0);
      expect(schoolRpc.slice(Math.max(0, statusIndex - 700), statusIndex)).toContain(
        "insert into public.school_timezone_audit"
      );
    }
  });

  it("keeps the server action school-derived and excludes Editor access", () => {
    const action = read("src/app/[school]/admin/settings/actions.ts");

    expect(action).toContain("const { schoolData, adminUser } = await requireSettingsAccess(school)");
    expect(action).toContain("p_school_id: schoolData.id");
    expect(action).not.toContain("p_school_id: formData");
    expect(action).toContain("isSchoolAdminRole(adminUser.profile.role)");
    expect(action).not.toContain("isEditorRole(adminUser.profile.role)");
  });
});
