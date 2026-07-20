import { describe, expect, it } from "vitest";
import { PASSWORD_RESET_CONFIRMATION, validateNewPassword, validateRecoveryEmail } from "./passwordRecovery";
import { getCanonicalPasswordRecoveryUrl, validatePasswordRecoveryReturnPath } from "../routing/canonicalUrls";
import { getSchoolForgotPasswordPath } from "../routing/paths";

describe("password recovery validation and safe routing", () => {
  it("builds tenant-aware forgot-password links", () => {
    expect(getSchoolForgotPasswordPath("north")).toBe("/north/forgot-password");
    expect(getSchoolForgotPasswordPath("south")).not.toContain("north");
  });

  it.each(["admin@example.org", "first.last+admin@example.co.uk"])("accepts valid email %s", (email) => expect(validateRecoveryEmail(email)).toBe(true));
  it.each(["", "not-an-email", "admin@", "@example.org", "a b@example.org"])("rejects invalid email %s", (email) => expect(validateRecoveryEmail(email)).toBe(false));

  it("uses one neutral response regardless of account existence", () => {
    expect(PASSWORD_RESET_CONFIRMATION).toBe("If an account exists for that email, we sent instructions to reset your password.");
    expect(PASSWORD_RESET_CONFIRMATION).not.toMatch(/not found|does not exist|unknown/i);
  });

  it("rejects external, protocol-relative, malformed, and unrelated returns", () => {
    for (const value of ["https://evil.example/login", "//evil.example/login", "/north/admin", "%E0%A4%A"]) {
      expect(validatePasswordRecoveryReturnPath(value)).toBe("/admin");
    }
  });

  it("allows only SuperAdmin or tenant login return paths", () => {
    expect(validatePasswordRecoveryReturnPath("/admin")).toBe("/admin");
    expect(validatePasswordRecoveryReturnPath("/north/login")).toBe("/north/login");
  });

  it.each([
    ["https://admin.sundialk12.com", "https://admin.sundialk12.com/auth/recovery?returnTo=%2Fnorth%2Flogin"],
    ["http://localhost:3000", "http://localhost:3000/auth/recovery?returnTo=%2Fnorth%2Flogin"],
  ])("builds a canonical recovery URL for %s", (adminUrl, expected) => {
    expect(getCanonicalPasswordRecoveryUrl({ adminUrl, returnPath: "/north/login" })).toBe(expected);
  });

  it("validates password matching and project length requirements", () => {
    expect(validateNewPassword("abcdefghijkl", "different123")).toMatch(/do not match/i);
    expect(validateNewPassword("short", "short")).toMatch(/at least 12/i);
    expect(validateNewPassword("a".repeat(129), "a".repeat(129))).toMatch(/128/i);
    expect(validateNewPassword("correct horse battery", "correct horse battery")).toBeNull();
  });
});
