import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initialPwaStartupSnapshot,
  reducePwaStartup,
  reuseAudienceLookup,
} from "./startupCoordinator";

function mountedStartup() {
  return reducePwaStartup(initialPwaStartupSnapshot, {
    type: "react_mounted",
  });
}

function withCache(recoveryRequired = false) {
  return reducePwaStartup(mountedStartup(), {
    type: "cache_resolved",
    recoveryRequired,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PWA startup coordinator", () => {
  it("keeps the loading state until audience lookup completes", () => {
    expect(withCache().state).toBe("hydrating_cached_state");
  });

  it("transitions a confirmed unassigned install to onboarding once", () => {
    const result = reducePwaStartup(withCache(), {
      type: "audience_resolved",
      result: { status: "unassigned", audience: null },
    });

    expect(result.state).toBe("onboarding_required");
    expect(
      reducePwaStartup(result, {
        type: "cache_resolved",
        recoveryRequired: false,
      }).state
    ).toBe("onboarding_required");
  });

  it("transitions an assigned device directly to the app", () => {
    expect(
      reducePwaStartup(withCache(), {
        type: "audience_resolved",
        result: { status: "assigned", audience: "student" },
      }).state
    ).toBe("ready");
  });

  it("moves onboarding completion directly to ready without remounting loading", () => {
    const onboarding = reducePwaStartup(withCache(), {
      type: "audience_resolved",
      result: { status: "unassigned", audience: null },
    });
    const completed = reducePwaStartup(onboarding, {
      type: "onboarding_completed",
      audience: "parent",
    });

    expect(completed.state).toBe("ready");
    expect(completed.audience).toEqual({
      status: "assigned",
      audience: "parent",
    });
  });

  it.each(["transport_error", "offline_unknown"] as const)(
    "does not flash onboarding for %s",
    (status) => {
      expect(
        reducePwaStartup(withCache(), {
          type: "audience_resolved",
          result: { status, audience: null },
        }).state
      ).toBe("ready");
    }
  );

  it("shows recovery only after both cache and audience resolve", () => {
    expect(
      reducePwaStartup(withCache(true), {
        type: "audience_resolved",
        result: { status: "offline_unknown", audience: null },
      }).state
    ).toBe("recovery_required");
  });

  it("reuses one lookup promise during duplicate effect execution", async () => {
    vi.stubGlobal("window", { setTimeout });
    const lookup = vi.fn(async () => ({
      status: "unassigned" as const,
      audience: null,
    }));

    const first = reuseAudienceLookup("school", lookup);
    const second = reuseAudienceLookup("school", lookup);

    expect(first).toBe(second);
    await expect(first).resolves.toEqual({
      status: "unassigned",
      audience: null,
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("locks a confirmed application reload state", () => {
    const pending = reducePwaStartup(mountedStartup(), {
      type: "application_reload_pending",
    });

    expect(
      reducePwaStartup(pending, {
        type: "audience_resolved",
        result: { status: "unassigned", audience: null },
      }).state
    ).toBe("application_reload_pending");
  });
});
