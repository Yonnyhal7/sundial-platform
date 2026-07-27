import { describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_FINALIZATION_RESERVE_MS,
  WEB_PUSH_HARD_TIMEOUT_MS,
  WebPushTimeoutError,
  canStartProviderAttempt,
  findMissingDeliveryDevices,
  isProvenUnattempted,
  summarizeCampaignDeliveries,
  withWebPushDeadline,
} from "./processorPolicy";

describe("notification processor policy", () => {
  it("enforces the hard provider deadline", async () => {
    vi.useFakeTimers();
    const operation = withWebPushDeadline(
      () => new Promise<never>(() => undefined),
      100
    );
    const expectation = expect(operation).rejects.toBeInstanceOf(WebPushTimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await expectation;
    vi.useRealTimers();
  });

  it("resolves promptly when the provider resolves", async () => {
    await expect(withWebPushDeadline(async () => "sent", 100)).resolves.toBe("sent");
  });

  it("bounds two stalled providers independently", async () => {
    vi.useFakeTimers();
    const stall = () => new Promise<never>(() => undefined);
    const first = withWebPushDeadline(stall, 100);
    const firstExpectation = expect(first).rejects.toBeInstanceOf(WebPushTimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await firstExpectation;
    const second = withWebPushDeadline(stall, 100);
    const secondExpectation = expect(second).rejects.toBeInstanceOf(WebPushTimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await secondExpectation;
    vi.useRealTimers();
  });

  it("stops before consuming the finalization reserve", () => {
    const startedAt = 1_000;
    const budget = 60_000;
    expect(canStartProviderAttempt(startedAt, startedAt, budget)).toBe(true);
    expect(canStartProviderAttempt(
      startedAt,
      startedAt + budget - WEB_PUSH_HARD_TIMEOUT_MS
        - NOTIFICATION_FINALIZATION_RESERVE_MS + 1,
      budget
    )).toBe(false);
  });

  it("only retries deliveries proven unattempted", () => {
    expect(isProvenUnattempted("pending")).toBe(true);
    for (const status of [
      "sending", "sent", "inbox_only", "failed", "disabled_subscription",
    ] as const) expect(isProvenUnattempted(status)).toBe(false);
  });

  it("does not recreate delivery rows during stale recovery", () => {
    const eligible = [{ id: "device-1" }, { id: "device-2" }];
    expect(findMissingDeliveryDevices(eligible, ["device-1", "device-2"])).toEqual([]);
    expect(findMissingDeliveryDevices(eligible, ["device-1"])).toEqual([
      { id: "device-2" },
    ]);
  });

  it.each([
    [[], 0, "no_eligible_devices", 0, 0],
    [["sent", "sent"], 2, "sent", 2, 0],
    [["sent", "failed"], 2, "partially_failed", 2, 1],
    [["failed", "failed"], 2, "failed", 2, 2],
    [["pending", "pending"], 2, "sending", 0, 0],
    [["sent", "pending"], 2, "sending", 1, 0],
    [["sending"], 1, "sending", 0, 0],
  ] as const)("summarizes %j", (statuses, eligible, status, attempted, failed) => {
    expect(summarizeCampaignDeliveries([...statuses], eligible)).toMatchObject({
      status, attempted, failed,
    });
  });
});
