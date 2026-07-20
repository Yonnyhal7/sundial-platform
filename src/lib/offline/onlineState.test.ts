import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserOnlineState,
  getHydrationSafeInitialOnlineState,
} from "./onlineState";

describe("offline runtime hydration state", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the same online fallback for SSR and the first client render", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(getHydrationSafeInitialOnlineState()).toBe(true);
  });

  it("reads the real browser state after hydration", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(getBrowserOnlineState()).toBe(false);
    vi.stubGlobal("navigator", { onLine: true });
    expect(getBrowserOnlineState()).toBe(true);
  });
});
