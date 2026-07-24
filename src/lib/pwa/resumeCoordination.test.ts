import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPwaApplicationUpdatePending,
  markPwaApplicationUpdatePending,
  markPwaUpdateCheckFinished,
  markPwaUpdateCheckStarted,
  waitForPwaUpdateCheck,
} from "@/lib/pwa/resumeCoordination";

describe("PWA resume coordination", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    markPwaUpdateCheckFinished();
  });

  it("exposes a pending full reload without tenant data", () => {
    const dataset: DOMStringMap = {};
    vi.stubGlobal("document", { documentElement: { dataset } });

    expect(isPwaApplicationUpdatePending()).toBe(false);
    markPwaApplicationUpdatePending();
    expect(isPwaApplicationUpdatePending()).toBe(true);
    expect(dataset.pwaApplicationUpdatePending).toBe("true");
  });

  it("releases data refresh only after the update check finishes", async () => {
    markPwaUpdateCheckStarted();
    let released = false;
    const wait = waitForPwaUpdateCheck().then(() => {
      released = true;
    });

    await Promise.resolve();
    expect(released).toBe(false);
    markPwaUpdateCheckFinished();
    await wait;
    expect(released).toBe(true);
  });
});
