import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const delivery = read("src/lib/email/schoolSetupDelivery.server.ts");
const action = read("src/app/admin/dashboard/schools/invitation-actions.ts");
const ui = read("src/app/admin/dashboard/schools/ResendSetupEmailButton.tsx");
const creationNotice = read(
  "src/app/admin/dashboard/schools/CreatedSchoolNotice.tsx"
);
const page = read("src/app/admin/dashboard/schools/page.tsx");
const creationAction = read("src/app/admin/dashboard/schools/actions.ts");
const acceptance = read("src/lib/invitations/acceptance.server.ts");
const migration = read(
  "supabase/migrations/20260713140000_school_setup_invitation_delivery.sql"
);

describe("SchoolAdmin invitation fallback reliability contract", () => {
  it("returns the current canonical fallback after either delivery outcome", () => {
    expect(delivery).toContain("fallbackUrl");
    expect(delivery).toContain("getCanonicalSchoolSetupInvitationUrl");
    expect(delivery).toMatch(/status: "sent"[\s\S]*fallbackUrl/);
    expect(delivery).toMatch(/status: "failed"[\s\S]*fallbackUrl/);
    expect(delivery).toContain("tokenRotated: rotateToken");
    expect(action).toContain("_previousState.fallbackUrl");
    expect(action).toContain("return response");
  });

  it("shows resend, copy, expiration, and stale-link explanation accessibly", () => {
    expect(ui).toContain("Resend email");
    expect(ui).toContain("Copy invitation link");
    expect(ui).toContain("Link expires");
    expect(ui).toContain("Any older copied link is no longer valid");
    expect(ui).toContain('aria-live="polite"');
    expect(ui).toContain("flex flex-wrap");
    expect(creationNotice).toContain("Copy invitation link");
    expect(creationNotice).toContain("getCanonicalSchoolSetupInvitationUrl");
  });

  it("reauthorizes the server action and never returns a hash", () => {
    expect(action).toContain("await requireSuperAdminAccess()");
    expect(action).toContain("isUuid(inviteId)");
    expect(action).toContain("isUuid(schoolId)");
    expect(action).toContain('.eq("school_id", schoolId)');
    expect(action).toContain("invitation.canceled_at");
    expect(action).toContain("invitation.used_at");
    expect(action).toContain("invitation.expires_at");
    expect(action).not.toContain("tokenHash:");
    expect(ui).not.toContain("tokenHash");
    expect(page).not.toContain("invite_token");
  });

  it("transports a creation fallback transiently without query strings or history retention", () => {
    expect(creationAction).toContain("#setupToken=");
    expect(creationAction).not.toContain("&invite=");
    expect(page).not.toContain("invite?:");
    expect(creationNotice).toContain("window.location.hash");
    expect(creationNotice).toContain('fragment.get("setupToken")');
    expect(creationNotice).toContain("window.history.replaceState");
    expect(creationNotice).not.toContain("console.");
  });

  it("preserves atomic tenant, lifecycle, concurrency, and throttle gates", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("i.school_id = p_school_id");
    expect(migration).toContain("v_school.archived_at is not null");
    expect(migration).toContain("v_invite.used_at is not null");
    expect(migration).toContain("v_invite.status = 'accepted'");
    expect(migration).toContain("interval '60 seconds'");
    expect(migration).toContain("'already_sending'");
    expect(migration).toContain("v_invite.delivery_status not in ('pending', 'failed')");
    expect(action).toContain("new Date(invitation.expires_at)");
    expect(action).not.toContain("getSchoolSetupInvitationExpiration");
  });

  it("keeps failed-email tokens acceptable while preserving expiry, use, and archive checks", () => {
    expect(acceptance).not.toContain('.eq("delivery_status", "sent")');
    expect(acceptance).toContain('.gt("expires_at", now.toISOString())');
    expect(acceptance).toContain('.is("used_at", null)');
    expect(acceptance).toContain("school_archived_at");
    expect(acceptance).toContain("invitation_accepted");
  });

  it("records resend, outcome, rotation, fallback, and acceptance without token material", () => {
    for (const event of [
      "invitation_resend_requested",
      "invitation_delivery_succeeded",
      "invitation_delivery_failed",
      "invitation_fallback_generated",
    ]) {
      expect(action).toContain(event);
    }
    expect(action).toContain("token_rotated");
    expect(action).not.toContain("raw_token:");
    expect(action).not.toContain("token_hash:");
    expect(action).not.toContain("fallback_url:");
    expect(acceptance).toContain("invitation_accepted");
  });
});
