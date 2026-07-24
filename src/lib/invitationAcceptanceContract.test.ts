import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { getCanonicalSchoolSetupInvitationUrl } from "@/lib/routing/canonicalUrls";
import { getSchoolSetupPath } from "@/lib/routing/paths";
import {
  createSchoolSetupInvitationToken,
  hashSchoolSetupInvitationToken,
} from "@/lib/invitations/tokens";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260713140000_school_setup_invitation_delivery.sql");
const acceptance = read("src/lib/invitations/acceptance.server.ts");
const actions = read("src/app/admin/invitations/actions.ts");
const experience = read("src/app/admin/invitations/InvitationExperience.tsx");
const exchangeRoute = read("src/app/api/invitations/exchange/route.ts");
const logout = read("src/components/admin/AdminLogoutButton.tsx");
const login = read("src/app/[school]/login/login-form.tsx");

describe("school invitation end-to-end contract", () => {
  it("generates the exact production URL and rewrites its public route without a session or school slug", async () => {
    const url = getCanonicalSchoolSetupInvitationUrl({
      adminUrl: "https://admin.sundialk12.com",
      token: "A".repeat(43),
    });
    expect(url).toBe(`https://admin.sundialk12.com/invitations#token=${"A".repeat(43)}`);
    expect(url).not.toContain("school=");

    const response = await proxy(
      new NextRequest(url.split("#")[0], {
        headers: { host: "admin.sundialk12.com" },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://admin.sundialk12.com/admin/invitations"
    );
    expect(existsSync(join(process.cwd(), "src/app/admin/invitations/page.tsx"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/app/admin/invitations/[token]/page.tsx"))).toBe(false);
  });

  it("keeps the raw invitation token in the fragment and exchanges it for a separately hashed session", () => {
    expect(experience).toContain("window.location.hash");
    expect(experience).toContain("window.history.replaceState");
    expect(acceptance).toContain("acceptance_session_hash: sessionHash");
    expect(exchangeRoute).toContain("httpOnly: true");
    expect(exchangeRoute).toContain('sameSite: "strict"');
    expect(migration).toContain("acceptance_session_hash text");
    expect(migration).not.toMatch(/acceptance_session_token\s+text/i);
  });

  it("rotates resend tokens and invalidates both the previous link and exchanged session", () => {
    const first = createSchoolSetupInvitationToken();
    const second = createSchoolSetupInvitationToken();
    expect(first).not.toBe(second);
    expect(hashSchoolSetupInvitationToken(first)).not.toBe(hashSchoolSetupInvitationToken(second));
    expect(migration).toContain("invite_token = case when p_rotate_token then p_token_hash");
    expect(migration).toContain("acceptance_session_hash = case when p_rotate_token then null");
  });

  it("allows exactly one acceptance claim and rejects an existing Auth identity", () => {
    expect(acceptance).toContain('.eq("status", "pending")');
    expect(acceptance).toContain('.update({ status: "accepting", acceptance_locked_at: now.toISOString() })');
    expect(acceptance).toContain('authError?.code === "email_exists"');
    expect(acceptance).toContain('"account_exists" as const');
    expect(actions).toContain("The invitation was not accepted or attached");
  });

  it("requires a chosen and confirmed password, establishes a session, and enters setup", () => {
    expect(experience).toContain('name="password"');
    expect(experience).toContain('name="confirmPassword"');
    expect(actions).toContain("password !== confirmPassword");
    expect(actions).toContain("sessionSupabase.auth.signInWithPassword");
    expect(actions).toContain("redirect(await getSchoolSetupPath(result.schoolSubdomain))");
    expect(
      getSchoolSetupPath(
        "del-oro",
        "/invitations",
        "admin.sundialk12.com"
      )
    ).toBe("/del-oro/dashboard/setup/welcome");
    expect(acceptance).toContain("email_confirm: true");
  });

  it("supports sign-out followed by the existing password sign-in flow", () => {
    expect(logout).toContain("supabase.auth.signOut()");
    expect(logout).toContain("router.push(`/${school}/login`)");
    expect(login).toContain("supabase.auth.signInWithPassword");
  });

  it("does not generate, display, email, or log a password or raw token", () => {
    expect(acceptance).not.toMatch(/generate.*password/i);
    expect(experience).not.toContain("defaultValue={password}");
    expect(read("src/lib/email/schoolSetupEmail.ts")).not.toMatch(/password/i);
    for (const source of [acceptance, actions, experience]) {
      expect(source).not.toMatch(/console\.(log|info|warn|error)/);
    }
  });
});
