import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const forgot = read("src/components/admin/ForgotPasswordForm.tsx");
const recovery = read("src/components/admin/PasswordRecoveryForm.tsx");
const schoolPage = read("src/app/[school]/forgot-password/page.tsx");
const login = read("src/components/admin/AdminLoginShell.tsx");
const invitation = read("src/app/admin/invitations/actions.ts");

describe("password recovery flow contract", () => {
  it("prevents duplicate requests and applies a client cooldown", () => {
    expect(forgot).toContain("submitting.current || cooldown > 0");
    expect(forgot).toContain("PASSWORD_RESET_COOLDOWN_SECONDS");
    expect(forgot).toContain("disabled={loading || cooldown > 0}");
  });
  it("establishes and requires a Supabase recovery session", () => {
    expect(recovery).toContain('event === "PASSWORD_RECOVERY"');
    expect(recovery).toContain("if (!valid || loading) return");
    expect(recovery).toContain("auth.updateUser({ password })");
  });
  it("handles missing or expired sessions and signs out after success", () => {
    expect(recovery).toContain("Reset link unavailable");
    expect(recovery).toContain("invalid or has expired");
    expect(recovery).toContain("await supabase.auth.signOut()");
    expect(recovery).toContain("passwordUpdated=1");
  });
  it("rejects unknown or archived schools before rendering the request form", () => {
    expect(schoolPage).toContain("getSchoolForSetup(school)");
    expect(schoolPage).toContain("notFound()");
  });
  it("keeps the existing login and invitation authentication paths intact", () => {
    expect(login).toContain("Forgot password?");
    expect(invitation).toContain("signInWithPassword");
    expect(invitation).not.toContain("resetPasswordForEmail");
  });
});
