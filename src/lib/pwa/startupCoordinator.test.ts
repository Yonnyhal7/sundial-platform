import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasPwaDestination,
  initialPwaStartupSnapshot,
  isInstalledPwaLaunch,
  isPwaStartupComplete,
  reducePwaStartup,
  resolveLocalAudienceState,
  reuseAudienceLookup,
  shouldWaitForPwaRoute,
  type PwaStartupEvent,
  type PwaStartupSnapshot,
} from "./startupCoordinator";

function run(events: PwaStartupEvent[], from = initialPwaStartupSnapshot) {
  return events.reduce(reducePwaStartup, from);
}

const localKnown: PwaStartupEvent = {
  type: "local_state_resolved",
  audience: "student",
  audienceRequired: false,
};
const localMissing: PwaStartupEvent = {
  type: "local_state_resolved",
  audience: null,
  audienceRequired: true,
};
const cacheOk: PwaStartupEvent = {
  type: "cache_resolved",
  recoveryRequired: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PWA startup state machine", () => {
  it("goes launching → app_ready when the audience is already known", () => {
    expect(initialPwaStartupSnapshot.phase).toBe("launching");
    expect(run([localKnown]).phase).toBe("launching");
    expect(run([localKnown, cacheOk]).phase).toBe("app_ready");
  });

  it("goes launching → audience_selection → app_ready when it is not", () => {
    const selecting = run([localMissing, cacheOk]);
    expect(selecting.phase).toBe("audience_selection");

    const chosen = reducePwaStartup(selecting, {
      type: "audience_selected",
      audience: "parent",
    });
    expect(chosen.phase).toBe("app_ready");
    expect(chosen.audience).toBe("parent");
  });

  it("goes launching → recovery when offline with no cached data", () => {
    expect(
      run([localKnown, { type: "cache_resolved", recoveryRequired: true }]).phase
    ).toBe("recovery");
  });

  it("never moves backwards to an earlier phase", () => {
    const ready = run([localKnown, cacheOk]);

    for (const event of [
      localMissing,
      cacheOk,
      { type: "cache_resolved", recoveryRequired: true },
      { type: "cache_probe_abandoned" },
      { type: "audience_sync_completed", result: { status: "unassigned", audience: null } },
    ] satisfies PwaStartupEvent[]) {
      expect(reducePwaStartup(ready, event).phase).toBe("app_ready");
    }

    // audience_selection may only move forward, never back to launching.
    const selecting = run([localMissing, cacheOk]);
    expect(reducePwaStartup(selecting, localMissing).phase).toBe(
      "audience_selection"
    );
  });

  it("keeps the overlay until a destination exists, then releases it once", () => {
    const launching = run([localKnown]);
    expect(hasPwaDestination(launching)).toBe(false);
    // The overlay cannot be released while startup is still launching.
    expect(
      reducePwaStartup(launching, { type: "overlay_released" }).overlayReleased
    ).toBe(false);

    const ready = run([localKnown, cacheOk]);
    expect(isPwaStartupComplete(ready)).toBe(false);
    const released = reducePwaStartup(ready, { type: "overlay_released" });
    expect(isPwaStartupComplete(released)).toBe(true);

    // Monotonic: nothing can bring the overlay back.
    for (const event of [localMissing, cacheOk] satisfies PwaStartupEvent[]) {
      expect(reducePwaStartup(released, event).overlayReleased).toBe(true);
    }
  });

  it("releases the overlay onto the audience screen, not onto the app", () => {
    const selecting = run([localMissing, cacheOk]);
    const released = reducePwaStartup(selecting, { type: "overlay_released" });

    expect(released.phase).toBe("audience_selection");
    expect(isPwaStartupComplete(released)).toBe(true);

    // Completing selection then reveals the app; the overlay never returns.
    const chosen = reducePwaStartup(released, {
      type: "audience_selected",
      audience: "staff",
    });
    expect(chosen.phase).toBe("app_ready");
    expect(chosen.overlayReleased).toBe(true);
  });

  it("never lets the background audience sync change the current launch", () => {
    for (const status of [
      "assigned",
      "unassigned",
      "offline_unknown",
      "transport_error",
    ] as const) {
      const before = run([localKnown, cacheOk]);
      const after = reducePwaStartup(before, {
        type: "audience_sync_completed",
        result:
          status === "assigned"
            ? { status, audience: "student" }
            : { status, audience: null },
      });
      expect(after.phase).toBe("app_ready");
      expect(after.audience).toBe("student");
    }
  });

  it("abandoning a wedged cache probe still picks a destination", () => {
    expect(run([localKnown, { type: "cache_probe_abandoned" }]).phase).toBe(
      "app_ready"
    );
    expect(run([localMissing, { type: "cache_probe_abandoned" }]).phase).toBe(
      "audience_selection"
    );
    // It cannot undo a recovery decision that already resolved.
    const recovery = run([
      localKnown,
      { type: "cache_resolved", recoveryRequired: true },
    ]);
    expect(
      reducePwaStartup(recovery, { type: "cache_probe_abandoned" }).phase
    ).toBe("recovery");
  });

  it("resolves the audience from local state with no network", () => {
    expect(resolveLocalAudienceState(true, "student")).toEqual({
      audience: "student",
      audienceRequired: false,
    });
    expect(resolveLocalAudienceState(true, null)).toEqual({
      audience: null,
      audienceRequired: true,
    });
    // A plain browser tab is never asked to choose an audience.
    expect(resolveLocalAudienceState(false, null)).toEqual({
      audience: null,
      audienceRequired: false,
    });
  });

  it("waits for a route fallback only when the app is the destination", () => {
    expect(shouldWaitForPwaRoute("app_ready", true)).toBe(true);
    expect(shouldWaitForPwaRoute("app_ready", false)).toBe(false);
    expect(shouldWaitForPwaRoute("audience_selection", true)).toBe(false);
    expect(shouldWaitForPwaRoute("recovery", true)).toBe(false);
    expect(shouldWaitForPwaRoute("launching", true)).toBe(false);
  });

  it("always reaches a destination for every startup outcome", () => {
    const outcomes: PwaStartupSnapshot[] = [
      run([localKnown, cacheOk]),
      run([localMissing, cacheOk]),
      run([localKnown, { type: "cache_resolved", recoveryRequired: true }]),
      run([localMissing, { type: "cache_probe_abandoned" }]),
    ];

    for (const outcome of outcomes) {
      expect(hasPwaDestination(outcome)).toBe(true);
    }
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
});
