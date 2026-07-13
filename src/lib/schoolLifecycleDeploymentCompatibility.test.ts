import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260713130000_school_lifecycle_management.sql"),
  "utf8"
).toLowerCase();

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8").toLowerCase();
}

describe("school lifecycle rolling-deployment compatibility", () => {
  it("keeps the deployed lookup RPC signature and application-role permissions", () => {
    const legacyLookup = migration.slice(
      migration.indexOf(
        "create or replace function public.get_school_by_subdomain(subdomain_input text)"
      ),
      migration.indexOf(
        "-- intentionally do not revoke or grant on the legacy function here."
      )
    );
    expect(migration).toContain(
      "create or replace function public.get_school_by_subdomain(subdomain_input text)"
    );
    expect(legacyLookup).toContain(`returns table(
  id uuid,
  district_id uuid,
  name text,
  slug text,
  subdomain text,
  mascot text,
  primary_color text,
  secondary_color text,
  logo_url text,
  timezone text,
  is_active boolean
)`);
    expect(legacyLookup).not.toContain("returns setof public.schools");
    expect(legacyLookup).toContain(`select
    s.id,
    s.district_id,
    s.name,
    s.slug,
    s.subdomain,
    s.mascot,
    s.primary_color,
    s.secondary_color,
    s.logo_url,
    s.timezone,
    s.is_active`);
    expect(legacyLookup).toContain("and s.is_active = true");
    expect(legacyLookup).toContain("and s.archived_at is null");
    expect(legacyLookup).toContain("where lower(s.subdomain) = lower(subdomain_input)");
    expect(migration).not.toContain(
      "revoke all on function public.get_school_by_subdomain(text) from public, anon, authenticated"
    );
    expect(migration).not.toContain(
      "revoke all on function public.get_school_by_subdomain(text) from public;"
    );
    expect(migration).not.toContain(
      "grant execute on function public.get_school_by_subdomain(text)"
    );
  });

  it("keeps the deployed AI calendar RPC while routing it through an archive gate", () => {
    expect(migration).toContain(
      "rename to create_ai_calendar_from_draft_unchecked"
    );
    expect(migration).toContain(
      "create or replace function public.create_ai_calendar_from_draft("
    );
    expect(migration).toContain("where id = p_school_id and archived_at is null");
    expect(migration).toContain(
      "grant execute on function public.create_ai_calendar_from_draft(uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb) to authenticated"
    );
    expect(migration).not.toContain(
      "revoke all on function public.create_ai_calendar_from_draft(uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb) from authenticated"
    );
  });

  it("keeps deployed Storage upload paths working for non-archived administrators", () => {
    expect(migration).toContain("create or replace function public.legacy_storage_object_is_available");
    expect(migration).toContain("p_bucket_id = 'resource-file'");
    expect(migration).toContain("= 'resources'");
    expect(migration).toContain("public.is_school_admin_or_editor() or public.current_user_is_super_admin()");
    expect(migration).toContain("or public.legacy_storage_object_is_available(bucket_id, name)");
  });

  it("keeps unarchived old-app RLS requests valid while denying archived tenants", () => {
    expect(migration).toContain("lifecycle rollout public school reads");
    expect(migration).toContain("lifecycle rollout authenticated school reads");
    expect(migration).toContain("lifecycle rollout permission mutations");
    for (const table of [
      "'announcements'",
      "'events'",
      "'sports'",
      "'teams'",
      "'games'",
      "'resources'",
    ]) {
      expect(migration).toContain(table);
    }
    expect(migration).toContain("school_id is null or exists (");
    expect(migration).toContain("lifecycle_school.archived_at is null");
    expect(migration).toContain("archived_at is null and is_active is true");
  });

  it("exposes both replacement RPCs used by the new application", () => {
    expect(source("src/lib/mobileAppData.ts")).toContain(
      '.rpc("get_available_school_by_subdomain"'
    );
    expect(source("src/app/[school]/admin/calendar/wizard/actions.ts")).toContain(
      '"create_available_ai_calendar_from_draft"'
    );
    expect(migration).toContain(
      "grant execute on function public.get_available_school_by_subdomain(text) to anon, authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.create_available_ai_calendar_from_draft(uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb) to authenticated"
    );
  });

  it("creates every lifecycle column and table before the new application reads it", () => {
    expect(migration).toContain("add column if not exists archived_at timestamptz");
    expect(migration).toContain("add column if not exists archived_by uuid");
    expect(migration).toContain("add column if not exists lifecycle_version bigint");
    expect(migration).toContain("create table if not exists public.school_deletion_audits");
    expect(migration).toContain("create table if not exists public.school_storage_cleanup_jobs");
    expect(source("src/app/admin/dashboard/schools/page.tsx")).toContain("archived_at");
  });
});
