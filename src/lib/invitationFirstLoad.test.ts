import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const experience = source("src/app/admin/invitations/InvitationExperience.tsx");
const action = source("src/app/admin/invitations/actions.ts");
const route = source("src/app/api/invitations/exchange/route.ts");

describe("first-load invitation verification lifecycle", () => {
  it("does not exchange a fragment through a cookie-mutating Server Action", () => {
    expect(action).not.toContain("exchangeInvitationTokenAction");
    expect(action).not.toContain("exchangeSchoolSetupInvitationToken");
    expect(experience).toContain('fetch("/api/invitations/exchange"');
  });

  it("keeps loading visible until a verified response resolves", () => {
    expect(experience).toContain("Checking your secure invitation");
    expect(experience).toContain("if (checking)");
    expect(experience).toMatch(
      /verificationRef\.current\.promise[\s\S]*\.then\([\s\S]*setView\(verifiedView\)[\s\S]*\.finally\(\(\) => \{[\s\S]*setChecking\(false\)/
    );
  });

  it("removes the fragment only after verification and preserves it on transport failure", () => {
    const verified = experience.indexOf("setView(verifiedView)");
    const removeFragment = experience.indexOf("window.history.replaceState");
    const failure = experience.indexOf("setVerificationError(true)");
    expect(removeFragment).toBeGreaterThan(verified);
    expect(failure).toBeGreaterThan(removeFragment);
    expect(experience.slice(failure)).not.toContain('setView({ status: "invalid" })');
  });

  it("uses a dynamic no-store route and never returns session token material", () => {
    expect(route).toContain('export const dynamic = "force-dynamic"');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain("{ view: result.view }");
    expect(route).not.toContain("{ view: result.view, sessionToken");
  });
});
