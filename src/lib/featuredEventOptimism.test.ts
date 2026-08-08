import { describe, expect, it } from "vitest";
import { getOptimisticFeaturedEventId, reconcileFeaturedEventId } from "./featuredEventOptimism";

describe("featured event optimistic state", () => {
  it("immediately replaces the previous featured event", () => {
    expect(getOptimisticFeaturedEventId("event-a", "event-b", true)).toBe("event-b");
  });

  it("immediately removes featured status", () => {
    expect(getOptimisticFeaturedEventId("event-a", "event-a", false)).toBeNull();
  });

  it("retains optimistic state on success and restores prior state on failure", () => {
    expect(reconcileFeaturedEventId({ previousFeaturedId: "event-a", optimisticFeaturedId: "event-b", succeeded: true })).toBe("event-b");
    expect(reconcileFeaturedEventId({ previousFeaturedId: "event-a", optimisticFeaturedId: "event-b", succeeded: false })).toBe("event-a");
  });
});
