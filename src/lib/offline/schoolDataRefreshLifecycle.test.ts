import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCHOOL_DATA_REFRESH_COALESCE_MS,
  startSchoolDataRefreshLifecycle,
  type SchoolDataRefreshResult,
} from "./schoolDataRefreshLifecycle";
import { getMillisecondsUntilNextMidnight } from "@/lib/timezones";

function createHarness(online = true, timeZone = "America/Los_Angeles") {
  const windowTarget = new EventTarget() as Window;
  Object.defineProperty(windowTarget, "navigator", {
    value: { onLine: online },
  });
  Object.assign(windowTarget, { setTimeout, clearTimeout });
  const documentTarget = new EventTarget() as Document;
  Object.defineProperty(documentTarget, "visibilityState", {
    value: "visible",
  });
  const refreshSnapshot = vi.fn<() => Promise<SchoolDataRefreshResult>>(
    async () =>
      online ? { status: "current", changed: true } : { status: "offline" }
  );
  const refreshRoute = vi.fn();
  const markOffline = vi.fn();
  const lifecycle = startSchoolDataRefreshLifecycle({
    window: windowTarget,
    document: documentTarget,
    timeZone,
    refreshSnapshot,
    refreshRoute,
    markOffline,
    now: () => new Date(Date.now()),
  });
  return {
    windowTarget,
    documentTarget,
    refreshSnapshot,
    refreshRoute,
    markOffline,
    lifecycle,
  };
}

async function flushEvent() {
  await vi.advanceTimersByTimeAsync(SCHOOL_DATA_REFRESH_COALESCE_MS);
}

describe("school data refresh lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T19:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("refreshes snapshot before route exactly once on foreground", async () => {
    const harness = createHarness();
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushEvent();
    expect(harness.refreshSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.refreshRoute).toHaveBeenCalledTimes(1);
    expect(harness.refreshSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      harness.refreshRoute.mock.invocationCallOrder[0]
    );
  });

  it("coalesces foreground and online events", async () => {
    const harness = createHarness();
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    harness.windowTarget.dispatchEvent(new Event("online"));
    await flushEvent();
    expect(harness.refreshSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.refreshRoute).toHaveBeenCalledTimes(1);
  });

  it("does not refresh the route on offline foreground", async () => {
    const harness = createHarness(false);
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushEvent();
    expect(harness.refreshSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.refreshRoute).not.toHaveBeenCalled();
  });

  it("does not refresh the route when foreground snapshot data is unchanged", async () => {
    const harness = createHarness();
    harness.refreshSnapshot.mockResolvedValue({
      status: "current",
      changed: false,
    });
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushEvent();
    expect(harness.refreshSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.refreshRoute).not.toHaveBeenCalled();
  });

  it("does not compete with a pending application reload", async () => {
    const harness = createHarness();
    harness.lifecycle.dispose();
    const onResumeDiagnostic = vi.fn();
    const lifecycle = startSchoolDataRefreshLifecycle({
      window: harness.windowTarget,
      document: harness.documentTarget,
      timeZone: "America/Los_Angeles",
      refreshSnapshot: harness.refreshSnapshot,
      refreshRoute: harness.refreshRoute,
      markOffline: harness.markOffline,
      shouldSkipRouteRefresh: () => true,
      onResumeDiagnostic,
    });
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushEvent();
    expect(harness.refreshSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.refreshRoute).not.toHaveBeenCalled();
    expect(onResumeDiagnostic).toHaveBeenCalledWith(
      "snapshot_refresh_start",
      "foreground"
    );
    expect(onResumeDiagnostic).toHaveBeenCalledWith(
      "snapshot_refresh_end",
      "current"
    );
    expect(onResumeDiagnostic).not.toHaveBeenCalledWith(
      "router_refresh",
      expect.anything()
    );
    lifecycle.dispose();
  });

  it("waits for the application update decision before refreshing the route", async () => {
    const harness = createHarness();
    harness.lifecycle.dispose();
    let finishUpdateCheck: (() => void) | undefined;
    let applicationUpdatePending = false;
    const lifecycle = startSchoolDataRefreshLifecycle({
      window: harness.windowTarget,
      document: harness.documentTarget,
      timeZone: "America/Los_Angeles",
      refreshSnapshot: harness.refreshSnapshot,
      refreshRoute: harness.refreshRoute,
      markOffline: harness.markOffline,
      waitForApplicationUpdateCheck: () =>
        new Promise<void>((resolve) => {
          finishUpdateCheck = resolve;
        }),
      shouldSkipRouteRefresh: () => applicationUpdatePending,
    });

    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushEvent();
    expect(harness.refreshRoute).not.toHaveBeenCalled();

    applicationUpdatePending = true;
    finishUpdateCheck?.();
    await Promise.resolve();
    expect(harness.refreshRoute).not.toHaveBeenCalled();
    lifecycle.dispose();
  });

  it("can refresh online route data after a known snapshot error", async () => {
    const harness = createHarness();
    harness.refreshSnapshot.mockResolvedValue({ status: "error" });
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushEvent();
    expect(harness.refreshRoute).toHaveBeenCalledTimes(1);
  });

  it("refreshes once on reconnect", async () => {
    const harness = createHarness();
    harness.windowTarget.dispatchEvent(new Event("online"));
    await flushEvent();
    expect(harness.refreshSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.refreshRoute).toHaveBeenCalledTimes(1);
  });

  it("uses the school timezone and handles two consecutive midnights", async () => {
    const firstDelay = getMillisecondsUntilNextMidnight(
      "America/New_York",
      new Date()
    );
    expect(firstDelay).not.toBe(
      getMillisecondsUntilNextMidnight("America/Los_Angeles", new Date())
    );
    const harness = createHarness(true, "America/New_York");
    await vi.advanceTimersByTimeAsync(firstDelay + SCHOOL_DATA_REFRESH_COALESCE_MS);
    expect(harness.refreshRoute).toHaveBeenCalledTimes(1);
    const secondDelay = getMillisecondsUntilNextMidnight(
      "America/New_York",
      new Date()
    );
    await vi.advanceTimersByTimeAsync(
      secondDelay + SCHOOL_DATA_REFRESH_COALESCE_MS + 2_000
    );
    expect(harness.refreshRoute).toHaveBeenCalledTimes(2);
  });

  it("handles a daylight-saving transition", async () => {
    vi.setSystemTime(new Date("2026-11-01T05:30:00.000Z"));
    const delay = getMillisecondsUntilNextMidnight(
      "America/New_York",
      new Date()
    );
    const harness = createHarness(true, "America/New_York");
    await vi.advanceTimersByTimeAsync(delay + SCHOOL_DATA_REFRESH_COALESCE_MS);
    expect(harness.refreshRoute).toHaveBeenCalledTimes(1);
  });

  it("cancels old tenant listeners and timers on dispose", async () => {
    const oldTenant = createHarness(true, "America/New_York");
    oldTenant.lifecycle.dispose();
    oldTenant.documentTarget.dispatchEvent(new Event("visibilitychange"));
    oldTenant.windowTarget.dispatchEvent(new Event("online"));
    await vi.runOnlyPendingTimersAsync();
    expect(oldTenant.refreshSnapshot).not.toHaveBeenCalled();

    const newTenant = createHarness(true, "America/Los_Angeles");
    newTenant.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushEvent();
    expect(newTenant.refreshRoute).toHaveBeenCalledTimes(1);
  });

  it("avoids overlapping requests and respects unsaved work", async () => {
    let resolveSnapshot: ((value: SchoolDataRefreshResult) => void) | undefined;
    const harness = createHarness();
    harness.lifecycle.dispose();
    harness.refreshSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        })
    );
    const lifecycle = startSchoolDataRefreshLifecycle({
      window: harness.windowTarget,
      document: harness.documentTarget,
      timeZone: "America/Los_Angeles",
      refreshSnapshot: harness.refreshSnapshot,
      refreshRoute: harness.refreshRoute,
      markOffline: harness.markOffline,
      hasUnsavedWork: () => true,
    });
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushEvent();
    harness.windowTarget.dispatchEvent(new Event("online"));
    await flushEvent();
    expect(harness.refreshSnapshot).toHaveBeenCalledTimes(1);
    resolveSnapshot?.({ status: "current", changed: true });
    await Promise.resolve();
    await flushEvent();
    expect(harness.refreshSnapshot).toHaveBeenCalledTimes(2);
    expect(harness.refreshRoute).not.toHaveBeenCalled();
    lifecycle.dispose();
  });
});
