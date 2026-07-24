import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260713130000_school_lifecycle_management.sql",
  ),
  "utf8",
).toLowerCase();
const reconciliation = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260724160000_reconcile_archived_school_deletion.sql",
  ),
  "utf8",
).toLowerCase();

describe("school lifecycle migration security", () => {
  it("uses durable archive ownership and independent cleanup records", () => {
    expect(migration).toContain("add column if not exists archived_at");
    expect(migration).toContain("add column if not exists archived_by");
    expect(migration).toContain(
      "create table if not exists public.school_deletion_audits",
    );
    expect(migration).toContain(
      "create table if not exists public.school_storage_cleanup_jobs",
    );
    expect(migration).toContain(
      "school_storage_cleanup_jobs_one_pending_per_school_idx",
    );
  });

  it("rechecks SuperAdmin, target identity, and archived state inside delete", () => {
    expect(migration).toContain("if not public.current_user_is_super_admin()");
    expect(migration).toContain(
      "v_school.name is distinct from p_expected_name",
    );
    expect(migration).toContain(
      "v_school.subdomain is distinct from p_expected_subdomain",
    );
    expect(migration).toContain("if v_school.archived_at is null then");
    expect(migration).toContain("for update");
  });

  it("preserves Auth users and fails closed on unaudited school foreign keys", () => {
    expect(migration).not.toContain("delete from auth.users");
    expect(migration).toContain("update public.users");
    expect(migration).toContain(
      "deletion blocked: unaudited school foreign keys",
    );
    expect(migration).toContain(
      "constraint_row.confrelid = 'public.schools'::regclass",
    );
  });

  it("gates tenant tables, lookups, storage, and AI calendar creation", () => {
    expect(migration).toContain("archived schools are unavailable");
    expect(migration).toContain("get_available_school_by_subdomain");
    expect(migration).toContain("archived school storage is unavailable");
    expect(migration).toContain("create_available_ai_calendar_from_draft");
    expect(migration).toContain(
      "create or replace function public.get_school_by_subdomain",
    );
    expect(migration).toContain(
      "create or replace preserves its existing public, anon, authenticated, and",
    );
    for (const table of [
      "analytics",
      "announcements",
      "calendar_days",
      "calendar_wizard_drafts",
      "events",
      "feature_flags",
      "games",
      "notifications",
      "pending_admin_invites",
      "periods",
      "resources",
      "schedule_patterns",
      "schedules",
      "sports",
      "teams",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
  });

  it("deletes school data in an explicit order and retains retryable file cleanup", () => {
    const periods = migration.indexOf("delete from public.periods");
    const schedules = migration.indexOf("delete from public.schedules");
    const school = migration.indexOf("delete from public.schools");
    expect(periods).toBeGreaterThan(0);
    expect(schedules).toBeGreaterThan(periods);
    expect(school).toBeGreaterThan(schedules);
    expect(migration).toContain("'database_deleted'");
    expect(migration).toContain("'storage_failed'");
  });

  it("reconciles deletion with memberships, invitations, billing, notifications, and audits", () => {
    for (const table of [
      "school_memberships",
      "pending_admin_invites",
      "school_subscriptions",
      "subscription_ledger_entries",
      "school_timezone_audit",
      "notification_audit",
      "notification_campaigns",
      "notification_devices",
      "platform_user_audit",
    ]) {
      expect(reconciliation).toContain(`public.${table}`);
    }
    expect(reconciliation).toContain("database_deleted_storage_pending");
    expect(reconciliation).toContain("database_failed");
  });
});
