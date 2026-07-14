import { describe, expect, it } from "vitest";
import {
  createSchoolSetupInvitationToken,
  getSchoolSetupInvitationExpiration,
  hashSchoolSetupInvitationToken,
  isPlausibleSchoolSetupInvitationToken,
} from "./tokens";

describe("school setup invitation tokens", () => {
  it("creates random URL-safe tokens and stores only a stable SHA-256 hash", () => {
    const first = createSchoolSetupInvitationToken();
    const second = createSchoolSetupInvitationToken();
    expect(first).not.toBe(second);
    expect(isPlausibleSchoolSetupInvitationToken(first)).toBe(true);
    expect(hashSchoolSetupInvitationToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSchoolSetupInvitationToken(first)).not.toContain(first);
  });

  it("expires invitations after seven days", () => {
    const now = new Date("2026-07-13T20:00:00.000Z");
    expect(getSchoolSetupInvitationExpiration(now).toISOString()).toBe(
      "2026-07-20T20:00:00.000Z"
    );
  });

  it("rejects malformed tokens and gives tampered tokens a different lookup hash", () => {
    const token = createSchoolSetupInvitationToken();
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(isPlausibleSchoolSetupInvitationToken("not-a-token")).toBe(false);
    expect(hashSchoolSetupInvitationToken(tampered)).not.toBe(
      hashSchoolSetupInvitationToken(token)
    );
  });
});
