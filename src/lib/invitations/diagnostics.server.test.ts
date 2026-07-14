import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logInvitationAcceptanceDatabaseFailure } from "./diagnostics.server";

describe("invitation acceptance database diagnostics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs only the failed stage, database code, and constraint name", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logInvitationAcceptanceDatabaseFailure("profile_insert", {
      code: "23514",
      message: 'new row violates check constraint "users_role_check"',
      details:
        "Failing row contains administrator@example.test, raw-token, password, cookie, service-key.",
    });

    expect(log).toHaveBeenCalledWith({
      failedStage: "profile_insert",
      databaseErrorCode: "23514",
      constraintName: "users_role_check",
    });
    const serializedLog = JSON.stringify(log.mock.calls);
    for (const secret of [
      "administrator@example.test",
      "raw-token",
      "password",
      "cookie",
      "service-key",
    ]) {
      expect(serializedLog).not.toContain(secret);
    }
  });

  it("replaces malformed diagnostic values instead of logging them", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logInvitationAcceptanceDatabaseFailure("profile_insert", {
      code: "bad code containing secret",
      constraint: "bad constraint containing secret",
    });
    expect(log).toHaveBeenCalledWith({
      failedStage: "profile_insert",
      databaseErrorCode: "unknown",
      constraintName: "unknown",
    });
  });
});
