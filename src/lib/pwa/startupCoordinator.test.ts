import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initialPwaStartupSnapshot,
  reducePwaStartup,
  reuseAudienceLookup,
  shouldWaitForPwaRoute,
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

  it("shows retry instead of entering ready on a transport failure", () => {
    expect(
      reducePwaStartup(withCache(), {
        type: "audience_resolved",
        result: { status: "transport_error", audience: null },
      }).state
    ).toBe("retry_required");
  });

  it("shows recovery instead of onboarding or app for an unknown offline device", () => {
    expect(
      reducePwaStartup(withCache(), {
        type: "audience_resolved",
        result: { status: "offline_unknown", audience: null },
      }).state
    ).toBe("recovery_required");
  });

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

  it("waits for route fallback removal only when the app is the destination", () => {
    expect(shouldWaitForPwaRoute("ready", true)).toBe(true);
    expect(shouldWaitForPwaRoute("ready", false)).toBe(false);
    expect(shouldWaitForPwaRoute("onboarding_required", true)).toBe(false);
    expect(shouldWaitForPwaRoute("retry_required", true)).toBe(false);
    expect(shouldWaitForPwaRoute("recovery_required", true)).toBe(false);
  });
});
