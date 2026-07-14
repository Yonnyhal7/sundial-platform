import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const setupRoot = read("src/app/[school]/admin/setup/page.tsx");
const welcomePage = read("src/app/[school]/admin/setup/welcome/page.tsx");
const setupContext = read("src/app/[school]/admin/setup/context.ts");
const setupLayout = read("src/app/[school]/admin/setup/setup-layout.tsx");
const adminPage = read("src/app/[school]/admin/page.tsx");
const loginPage = read("src/app/[school]/login/page.tsx");
const loginForm = read("src/app/[school]/login/login-form.tsx");
const setupActions = read("src/app/[school]/admin/setup/actions.ts");
const schools = read("src/lib/schools.ts");
const superAdminDashboard = read("src/app/admin/dashboard/page.tsx");
const superAdminSchools = read("src/app/admin/dashboard/schools/page.tsx");

describe("school setup landing routing", () => {
  it("rewrites the exact production setup base and its steps without proxy redirects", () => {
    const baseResponse = proxy(
      new NextRequest("https://admin.sundialk12.com/deloro/dashboard/setup", {
        headers: { host: "admin.sundialk12.com" },
      })
    );
    expect(baseResponse.status).toBe(200);
    expect(baseResponse.headers.get("x-middleware-rewrite")).toBe(
      "https://admin.sundialk12.com/deloro/admin/setup"
    );

    const stepResponse = proxy(
      new NextRequest(
        "https://admin.sundialk12.com/deloro/dashboard/setup/school-profile",
        { headers: { host: "admin.sundialk12.com" } }
      )
    );
    expect(stepResponse.status).toBe(200);
    expect(stepResponse.headers.get("x-middleware-rewrite")).toBe(
      "https://admin.sundialk12.com/deloro/admin/setup/school-profile"
    );
  });

  it("guards the setup base before redirecting it to the centralized Welcome path", () => {
    const contextCheck = setupRoot.indexOf("await getSetupContext(school)");
    const landingRedirect = setupRoot.indexOf(
      "redirect(await getSchoolSetupPath(school))"
    );
    expect(contextCheck).toBeGreaterThanOrEqual(0);
    expect(landingRedirect).toBeGreaterThan(contextCheck);
    expect(setupContext).toContain("requireAdminPortalAccess(schoolData.id, school)");
  });

  it("leaves direct setup-step pages in place", () => {
    for (const step of [
      "school-profile",
      "appearance",
      "administrators",
      "schedule",
      "complete",
    ]) {
      const source = read(`src/app/[school]/admin/setup/${step}/page.tsx`);
      expect(source).not.toContain("getSchoolSetupPath(school)");
    }
  });

  it("routes incomplete dashboard and login entries to Welcome", () => {
    expect(adminPage).toContain("redirect(await getSchoolSetupPath(school))");
    expect(loginPage).toContain("getSchoolSetupStatus(schoolData)");
    expect(loginForm).toContain("getSchoolLoginDestination");
  });

  it("keeps completed schools on the dashboard and completion redirects there", () => {
    expect(setupContext).toContain("if (await isSchoolSetupComplete");
    expect(setupContext).toContain("redirect(await getSchoolAdminPath(school))");
    expect(setupActions).toMatch(
      /updateSchoolSetupComplete[\s\S]*redirect\(await getSchoolAdminPath\(school\)\)/
    );
  });

  it("keeps archived and unauthorized schools blocked", () => {
    expect(loginPage).toContain("if (!schoolData)");
    expect(loginPage).toContain("notFound()");
    expect(schools).toContain('.is("archived_at", null)');
    expect(setupContext).toContain("requireAdminPortalAccess(schoolData.id, school)");
  });

  it("opens incomplete SuperAdmin school links at Welcome", () => {
    for (const source of [superAdminDashboard, superAdminSchools]) {
      expect(source).toContain('getSchoolSetupStatus(school) === "incomplete"');
      expect(source).toContain("getSchoolSetupPath(school.subdomain)");
      expect(source).toContain("getSchoolAdminPath(school.subdomain)");
    }
  });

  it("has no Welcome self-redirect or first-step Back-link redirect loop", () => {
    expect(welcomePage).not.toContain('from "next/navigation"');
    expect(welcomePage).not.toContain("redirect(");
    expect(setupLayout).not.toContain(": await getSchoolAdminPath(school)");
    expect(setupRoot).not.toContain('"use client"');
    expect(setupRoot).not.toMatch(/router\.(push|replace|back)/);
  });
});
