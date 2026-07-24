import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("SuperAdmin user directory", () => {
  const migration = read("supabase/migrations/20260720190000_superadmin_user_memberships.sql");
  const actions = read("src/app/admin/dashboard/users/actions.ts");
  const page = read("src/app/admin/dashboard/users/page.tsx");

  it("models multi-school memberships and backfills existing profiles", () => {
    expect(migration).toContain("create table if not exists public.school_memberships");
    expect(migration).toContain("unique(user_id,school_id)");
    expect(migration).toContain("insert into public.school_memberships");
    expect(migration).toContain("role text not null check (role in ('SchoolAdmin','Editor'))");
  });

  it("enforces final-admin safety atomically and audits blocked attempts", () => {
    expect(migration.match(/lock table public\.school_memberships in share row exclusive mode/g)).toHaveLength(2);
    expect(migration).toContain("id<>v_before.id");
    expect(migration).toContain("final_admin_removal_blocked");
    expect(migration).toContain("final_admin_change_blocked");
  });

  it("extends tenant authorization to active memberships", () => {
    expect(migration).toContain("create or replace function public.current_user_can_access_school");
    expect(migration).toContain("m.school_id=p_school_id and m.is_active");
    expect(migration).toContain("create or replace function public.current_user_can_manage_school_section");
  });

  it("keeps directory filters and pagination server-side", () => {
    expect(page).toContain('rpc("search_platform_users"');
    expect(migration).toContain("offset greatest(p_offset,0)");
    expect(migration).toContain("limit least(greatest(p_limit,1),100)");
    expect(page.match(/auth\.admin\.listUsers/g)).toHaveLength(1);
  });

  it("guards mutations and uses secure invitation and recovery paths", () => {
    expect(actions.match(/requireSuperAdminAccess\(\)/g)?.length).toBeGreaterThanOrEqual(7);
    expect(actions).toContain("deliverSchoolSetupInvitation");
    expect(actions).toContain("createSchoolSetupInvitationToken");
    expect(actions).toContain("resetPasswordForEmail");
    expect(actions).not.toContain("generateLink");
    expect(actions).not.toContain("updateUserById");
  });

  it("never deletes Auth identities when memberships are removed", () => {
    const removeFunction = migration.slice(
      migration.indexOf("create or replace function public.remove_school_membership"),
      migration.indexOf("create or replace function public.cancel_platform_user_invitation")
    );
    expect(removeFunction).toContain("set is_active=false");
    expect(removeFunction).not.toContain("delete from public.users");
    expect(removeFunction).not.toContain("auth.users");
  });
});
