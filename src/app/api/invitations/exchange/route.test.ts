import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/invitations/acceptance.server", () => ({
  exchangeSchoolSetupInvitationToken: mocks.exchange,
}));

import { POST } from "./route";

describe("invitation token exchange route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits the acceptance cookie in the same uncached response as the valid view", async () => {
    mocks.exchange.mockResolvedValue({
      view: {
        status: "valid",
        schoolName: "Test School",
        email: "controlled@example.com",
      },
      sessionToken: "S".repeat(43),
      sessionExpiresAt: new Date("2026-07-25T20:00:00.000Z"),
    });

    const response = await POST(
      new Request("https://admin.sundialk12.com/api/invitations/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "T".repeat(43) }),
      })
    );

    expect(mocks.exchange).toHaveBeenCalledWith("T".repeat(43));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain(
      "sundial_school_setup_acceptance="
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
    await expect(response.json()).resolves.toEqual({
      view: {
        status: "valid",
        schoolName: "Test School",
        email: "controlled@example.com",
      },
    });
  });

  it("returns a verified invalid view without creating acceptance state", async () => {
    mocks.exchange.mockResolvedValue({ view: { status: "invalid" } });
    const response = await POST(
      new Request("https://admin.sundialk12.com/api/invitations/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "invalid" }),
      })
    );

    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({ view: { status: "invalid" } });
  });
});
