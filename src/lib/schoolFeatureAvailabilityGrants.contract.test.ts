import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const reconciliationMigrationPath =
  "supabase/migrations/20260724105000_reconcile_school_feature_availability_grants.sql";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (![".ts", ".tsx"].includes(extname(entry.name))) return [];
    if (entry.name.includes(".test.") || entry.name.includes(".spec.")) return [];
    return [path];
  });
}

function stripSqlComments(sql: string) {
  return sql.replace(/--.*$/gm, "");
}

describe("school_feature_availability grant reconciliation", () => {
  it("removes every application-role privilege and grants back only SELECT", () => {
    const sql = stripSqlComments(read(reconciliationMigrationPath)).toLowerCase();

    expect(sql).toMatch(
      /revoke all privileges\s+on table public\.school_feature_availability\s+from anon;/
    );
    expect(sql).toMatch(
      /revoke all privileges\s+on table public\.school_feature_availability\s+from authenticated;/
    );
    expect(sql).toMatch(
      /grant select\s+on table public\.school_feature_availability\s+to anon;/
    );
    expect(sql).toMatch(
      /grant select\s+on table public\.school_feature_availability\s+to authenticated;/
    );

    expect(sql).not.toMatch(
      /revoke[\s\S]*school_feature_availability[\s\S]*from\s+(postgres|service_role)/
    );
    expect(sql).not.toMatch(
      /\b(?:alter|create|drop)\s+(?:table|index|trigger|function|policy)\b/
    );
  });

  it("verifies effective privileges so inherited write access cannot survive", () => {
    const sql = read(reconciliationMigrationPath);

    expect(sql).toContain("has_table_privilege");
    expect(sql).toContain("'SELECT'");
    for (const privilege of [
      "DELETE",
      "INSERT",
      "REFERENCES",
      "TRIGGER",
      "TRUNCATE",
      "UPDATE",
    ]) {
      expect(sql).toContain(`'${privilege}'`);
    }
  });

  it("keeps the security correction before the pending notification migration", () => {
    expect(20260724105000).toBeLessThan(20260724110000);
  });

  it("has no browser or application-role mutation path for the table", () => {
    const matches = sourceFiles(join(process.cwd(), "src")).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      if (!source.includes("school_feature_availability")) return [];
      return [{ path, source }];
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.path.replaceAll("\\", "/")).toMatch(
      /src\/lib\/schoolFeatures\.server\.ts$/
    );
    expect(matches[0]?.source).toContain('import "server-only"');
    expect(matches[0]?.source).toContain("createSupabaseServiceRoleClient");
    expect(matches[0]?.source).toContain('.select("enabled")');
    expect(matches[0]?.source).not.toMatch(/\.(?:insert|update|upsert|delete)\s*\(/);
  });

  it("keeps trusted writes in the existing security-definer school-creation RPC", () => {
    const foundation = read(
      "supabase/migrations/20260720150000_platform_settings_foundation.sql"
    );
    const action = read("src/app/admin/dashboard/schools/actions.ts");

    expect(foundation).toContain(
      "insert into public.school_feature_availability"
    );
    expect(foundation).toMatch(
      /create or replace function public\.create_school_with_platform_defaults[\s\S]*security definer/
    );
    expect(foundation).toContain(
      "grant all on public.school_feature_availability to service_role"
    );
    expect(action).toContain('rpc("create_school_with_platform_defaults"');
  });
});
