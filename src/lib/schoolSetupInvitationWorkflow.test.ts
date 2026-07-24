import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const creationAction = read("src/app/admin/dashboard/schools/actions.ts");
const resendAction = read("src/app/admin/dashboard/schools/invitation-actions.ts");
const acceptance = read("src/lib/invitations/acceptance.server.ts");
const acceptanceActions = read("src/app/admin/invitations/actions.ts");
const setupActions = read("src/app/[school]/admin/setup/actions.ts");
const setupContext = read("src/app/[school]/admin/setup/context.ts");
const serviceRoleClient = read("src/lib/supabase/serviceRole.ts");

describe("school setup invitation application workflow", () => {
  it("creates the school and invitation before delivery and retains both on failure", () => {
    const schoolInsert = creationAction.indexOf("insertSchoolWithPlatformDefaults");
    const inviteInsert = creationAction.indexOf("createPendingAdminInvite", schoolInsert);
    const delivery = creationAction.indexOf("deliverSchoolSetupInvitation", inviteInsert);
    expect(schoolInsert).toBeGreaterThanOrEqual(0);
    expect(inviteInsert).toBeGreaterThan(schoolInsert);
    expect(delivery).toBeGreaterThan(inviteInsert);
    expect(creationAction).toContain("The school is intentionally retained");
    expect(creationAction).not.toMatch(/\.from\("schools"\)\s*\.delete\(\)/);
  });

  it("authorizes both create and resend as SuperAdmin server actions", () => {
    expect(creationAction).toContain("await requireSuperAdminAccess()");
    expect(resendAction).toContain("await requireSuperAdminAccess()");
    expect(resendAction).toContain("rotateToken: true");
    expect(resendAction).toContain("fallback_link_generated");
    expect(resendAction).toContain("invitation_resend_requested");
  });

  it("validates tenant, token, expiry, use, and archive state before account creation", () => {
    const classification = acceptance.indexOf("classifySchoolSetupInvitation");
    const authCreation = acceptance.indexOf("auth.admin.createUser");
    expect(classification).toBeGreaterThanOrEqual(0);
    expect(authCreation).toBeGreaterThan(classification);
    expect(acceptance).toContain('.eq("invite_token", result.tokenHash)');
    expect(acceptance).toContain('.eq("acceptance_session_hash", sessionHash)');
    expect(acceptance).not.toContain('.eq("delivery_status", "sent")');
    expect(acceptance).toContain('.eq("school_id", school.id)');
    expect(acceptance).toContain('.gt("expires_at", now.toISOString())');
    expect(acceptance).toContain('.is("used_at", null)');
    expect(acceptance).toContain("buildSchoolAdminProfileInsert");
    expect(read("src/lib/invitations/profile.ts")).toContain(
      'SCHOOL_ADMIN_DATABASE_ROLE = "SchoolAdmin"'
    );
    expect(acceptanceActions).toContain("confirmPassword");
    expect(acceptanceActions).toContain("signInWithPassword");
    expect(acceptanceActions).toContain("getSchoolSetupPath");
    expect(acceptance).toContain('"invitation_accepted"');
  });

  it("uses the service-role client for profile creation and preserves compensation", () => {
    expect(acceptance).toContain("createSupabaseServiceRoleClient");
    expect(serviceRoleClient).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(serviceRoleClient).toContain("persistSession: false");

    const profileFailure = acceptance.indexOf("if (profileError)");
    const authCompensation = acceptance.indexOf("auth.admin.deleteUser", profileFailure);
    const invitationReset = acceptance.indexOf("releaseClaim()", authCompensation);
    expect(profileFailure).toBeGreaterThanOrEqual(0);
    expect(authCompensation).toBeGreaterThan(profileFailure);
    expect(invitationReset).toBeGreaterThan(authCompensation);
  });

  it("keeps the delivered owner invitation out of setup-wizard staff drafts", () => {
    expect(setupActions).toContain('.is("created_by", null)');
    expect(setupContext).toContain('.is("created_by", null)');
  });

  it("never logs a raw token, setup URL, password, or provider secret", () => {
    const invitationSources = [creationAction, resendAction, acceptance, acceptanceActions];
    for (const source of invitationSources) {
      expect(source).not.toMatch(/console\.(log|info|warn|error)/);
    }
  });
});
