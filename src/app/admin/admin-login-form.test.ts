import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const superAdminLogin = read("src/app/admin/admin-login-form.tsx");
const schoolAdminLogin = read("src/app/[school]/login/login-form.tsx");
const schoolAdminPage = read("src/app/[school]/login/page.tsx");
const shell = read("src/components/admin/AdminLoginShell.tsx");
const themeToggle = read("src/components/ThemeToggle.tsx");
const schools = read("src/lib/schools.ts");

describe("shared admin login appearance", () => {
  it("renders the same shared shell for SuperAdmin and school-admin login", () => {
    expect(superAdminLogin).toContain('from "@/components/admin/AdminLoginShell"');
    expect(superAdminLogin).toContain("<AdminLoginShell");
    expect(schoolAdminLogin).toContain('from "@/components/admin/AdminLoginShell"');
    expect(schoolAdminLogin).toContain("<AdminLoginShell");
  });

  it("uses the fixed admin appearance and Sundial branding", () => {
    expect(shell).toContain("data-admin-login-shell");
    expect(shell).toContain('<ThemeToggle');
    expect(shell).toContain('scope="admin"');
    expect(shell).toContain('variant="segmented"');
    expect(shell).toContain("fixedAdminColors");
    expect(shell).toContain('src="/sundial-icon.png"');
    expect(shell).toContain("Sundial Admin");
  });

  it("isolates the full viewport and form controls from school theme styles", () => {
    expect(shell).toContain("fixed inset-0 z-50");
    expect(shell).toContain("bg-slate-100");
    expect(shell).toContain("dark:bg-[#0b1120]");
    expect(shell).toContain("border-slate-300 bg-white");
    expect(shell).toContain("dark:bg-[#0b1220]");
    expect(shell).not.toContain("--school-");
    expect(shell).not.toContain("school-public-theme");
  });

  it("applies the admin theme before revealing the responsive login", () => {
    expect(shell).toContain("useState(false)");
    expect(shell).toContain('getPreferredAppearance("admin")');
    expect(shell).toContain("applyTheme(resolveAppearanceTheme(preference)");
    expect(shell).toContain('themeReady ? "opacity-100" : "opacity-0"');
    expect(shell).toContain("min-h-dvh");
    expect(shell).toContain("w-full max-w-md");
  });

  it("shares validation, loading, and accessible error presentation", () => {
    expect(shell).toContain('type="email"');
    expect(shell).toContain('type="password"');
    expect(shell.match(/required/g)?.length).toBe(2);
    expect(shell).toContain('autoComplete="email"');
    expect(shell).toContain('autoComplete="current-password"');
    expect(shell).toContain('role="alert"');
    expect(shell).toContain('disabled={loading}');
    expect(shell).toContain('loading ? "Signing in..." : "Sign In"');
  });

  it("supports keyboard operation for the segmented appearance control", () => {
    expect(themeToggle).toContain('role="radiogroup"');
    expect(themeToggle).toContain('role="radio"');
    expect(themeToggle).toContain('"ArrowRight"');
    expect(themeToggle).toContain('"ArrowLeft"');
    expect(themeToggle).toContain('"Home"');
    expect(themeToggle).toContain('"End"');
  });
});

describe("school-admin login isolation and routing", () => {
  it("retains school-specific authentication routing, never SuperAdmin routing", () => {
    expect(schoolAdminLogin).toContain("getSchoolLoginDestination(");
    expect(schoolAdminLogin).toContain("school,");
    expect(schoolAdminLogin).toContain("setupComplete");
    expect(schoolAdminLogin).not.toContain("getAdminUtilityPath");
    expect(schoolAdminLogin).not.toContain('"/admin/dashboard"');
  });

  it("retains setup status and unavailable-school guards", () => {
    expect(schoolAdminPage).toContain("getSchoolSetupStatus(schoolData)");
    expect(schoolAdminPage).toContain('=== "active"');
    expect(schoolAdminPage).toContain("if (!schoolData)");
    expect(schoolAdminPage).toContain("notFound()");
    expect(schools).toContain('.is("archived_at", null)');
  });
});
