import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initialPwaStartupSnapshot,
  isInstalledPwaLaunch,
  isPwaShellReady,
  reducePwaStartup,
  reuseAudienceLookup,
  shouldShowAudienceOnboarding,
  shouldWaitForPwaRoute,
  type PwaStartupSnapshot,
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

describe("PWA startup readiness", () => {
  it("becomes ready as soon as the local snapshot probe settles", () => {
    expect(mountedStartup().state).toBe("hydrating_cached_state");
    expect(withCache().state).toBe("ready");
    expect(isPwaShellReady(withCache().state)).toBe(true);
  });

  it("never waits on the notification audience lookup", () => {
    const ready = withCache();

    for (const status of [
      "unassigned",
      "transport_error",
      "offline_unknown",
    ] as const) {
      const next = reducePwaStartup(ready, {
        type: "audience_resolved",
        result: { status, audience: null },
      });
      expect(next.state).toBe("ready");
      expect(isPwaShellReady(next.state)).toBe(true);
    }
  });

  it("stays in the loading state until the probe settles or is abandoned", () => {
    const mounted = mountedStartup();

    expect(
      reducePwaStartup(mounted, {
        type: "audience_resolved",
        result: { status: "assigned", audience: "student" },
      }).state
    ).toBe("hydrating_cached_state");

    expect(
      reducePwaStartup(mounted, { type: "cache_probe_abandoned" }).state
    ).toBe("ready");
  });

  it("abandoning the probe after it resolved cannot downgrade recovery", () => {
    const recovery = withCache(true);
    expect(recovery.state).toBe("recovery_required");
    expect(
      reducePwaStartup(recovery, { type: "cache_probe_abandoned" }).state
    ).toBe("recovery_required");
  });

  it("shows an actionable recovery screen instead of a permanent loader", () => {
    expect(withCache(true).state).toBe("recovery_required");
    expect(isPwaShellReady(withCache(true).state)).toBe(true);
  });

  it("surfaces onboarding above a ready shell, never as a startup gate", () => {
    const unassigned = reducePwaStartup(withCache(), {
      type: "audience_resolved",
      result: { status: "unassigned", audience: null },
    });

    expect(unassigned.state).toBe("ready");
    expect(shouldShowAudienceOnboarding(unassigned)).toBe(true);

    // Not while the shell is still loading.
    const stillLoading = reducePwaStartup(mountedStartup(), {
      type: "audience_resolved",
      result: { status: "unassigned", audience: null },
    });
    expect(shouldShowAudienceOnboarding(stillLoading)).toBe(false);

    const completed = reducePwaStartup(unassigned, {
      type: "onboarding_completed",
      audience: "parent",
    });
    expect(completed.state).toBe("ready");
    expect(shouldShowAudienceOnboarding(completed)).toBe(false);
    expect(completed.audience).toEqual({
      status: "assigned",
      audience: "parent",
    });
  });

  it("does not show onboarding for a failed or offline lookup", () => {
    for (const status of ["transport_error", "offline_unknown"] as const) {
      const snapshot = reducePwaStartup(withCache(), {
        type: "audience_resolved",
        result: { status, audience: null },
      });
      expect(shouldShowAudienceOnboarding(snapshot)).toBe(false);
    }
  });

  it("locks a confirmed application reload state", () => {
    const pending = reducePwaStartup(mountedStartup(), {
      type: "application_reload_pending",
    });

    expect(
      reducePwaStartup(pending, {
        type: "cache_resolved",
        recoveryRequired: false,
      }).state
    ).toBe("application_reload_pending");
  });

  it("waits for route fallback removal only when the app is the destination", () => {
    expect(shouldWaitForPwaRoute("ready", true)).toBe(true);
    expect(shouldWaitForPwaRoute("ready", false)).toBe(false);
    expect(shouldWaitForPwaRoute("recovery_required", true)).toBe(false);
    expect(shouldWaitForPwaRoute("hydrating_cached_state", true)).toBe(false);
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

  it("recognizes iOS Home Screen launches without relying on display-mode", () => {
    expect(isInstalledPwaLaunch(false, true)).toBe(true);
    expect(isInstalledPwaLaunch(true, undefined)).toBe(true);
    expect(isInstalledPwaLaunch(false, undefined)).toBe(false);
  });

  it("cannot leave the overlay up for any audience outcome", () => {
    const outcomes: PwaStartupSnapshot[] = (
      ["assigned", "unassigned", "transport_error", "offline_unknown"] as const
    ).map((status) =>
      reducePwaStartup(withCache(), {
        type: "audience_resolved",
        result:
          status === "assigned"
            ? { status, audience: "student" }
            : { status, audience: null },
      })
    );

    for (const outcome of outcomes) {
      expect(isPwaShellReady(outcome.state)).toBe(true);
    }
  });
});
