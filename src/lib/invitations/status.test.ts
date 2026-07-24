import { describe, expect, it } from "vitest";
import { classifySchoolSetupInvitation, type SchoolSetupInvitationRecord } from "./status";

const now = new Date("2026-07-13T20:00:00.000Z");
const valid: SchoolSetupInvitationRecord = {
  status: "pending",
  delivery_status: "sent",
  expires_at: "2026-07-20T20:00:00.000Z",
  used_at: null,
  acceptance_locked_at: null,
  school_subdomain: "del-oro",
  school_archived_at: null,
};

describe("school setup invitation acceptance", () => {
  it("accepts a current token independently of email-provider delivery state", () => {
    expect(classifySchoolSetupInvitation(valid, "del-oro", now)).toBe("valid");
    expect(classifySchoolSetupInvitation(valid, "liberty", now)).toBe("invalid");
    expect(
      classifySchoolSetupInvitation({ ...valid, school_archived_at: now.toISOString() }, "del-oro", now)
    ).toBe("invalid");
    expect(
      classifySchoolSetupInvitation({ ...valid, delivery_status: "failed" }, "del-oro", now)
    ).toBe("valid");
    expect(
      classifySchoolSetupInvitation({ ...valid, delivery_status: "pending" }, "del-oro", now)
    ).toBe("valid");
    expect(
      classifySchoolSetupInvitation({ ...valid, delivery_status: "sending" }, "del-oro", now)
    ).toBe("valid");
  });

  it("rejects expired and already-used invitations", () => {
    expect(
      classifySchoolSetupInvitation({ ...valid, expires_at: now.toISOString() }, "del-oro", now)
    ).toBe("expired");
    expect(
      classifySchoolSetupInvitation({ ...valid, used_at: now.toISOString() }, "del-oro", now)
    ).toBe("already_used");
    expect(
      classifySchoolSetupInvitation({ ...valid, status: "accepted" }, "del-oro", now)
    ).toBe("already_used");
    expect(
      classifySchoolSetupInvitation({ ...valid, status: "cancelled" }, "del-oro", now)
    ).toBe("invalid");
  });

  it("blocks overlapping acceptance but permits recovery from a stale lock", () => {
    expect(
      classifySchoolSetupInvitation(
        { ...valid, status: "accepting", acceptance_locked_at: "2026-07-13T19:55:00.000Z" },
        "del-oro",
        now
      )
    ).toBe("temporarily_locked");
    expect(
      classifySchoolSetupInvitation(
        { ...valid, status: "accepting", acceptance_locked_at: "2026-07-13T19:40:00.000Z" },
        "del-oro",
        now
      )
    ).toBe("valid");
  });
});
