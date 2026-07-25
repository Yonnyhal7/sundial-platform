import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPwaLaunchPrepaintScript,
  PWA_LAUNCH_CRITICAL_CSS,
} from "@/lib/pwa/launchScreen";

afterEach(() => vi.unstubAllGlobals());

describe("PWA startup first frame", () => {
  it("marks app routes for the server launch shell before paint", () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal("document", { documentElement: { dataset } });
    vi.stubGlobal("location", { pathname: "/deloro/app" });

    Function(getPwaLaunchPrepaintScript())();

    expect(dataset.pwaAppLaunch).toBe("true");
    expect(dataset.pwaLaunch).toBe("pending");
    expect(dataset.pwaStartupReady).toBe("false");
  });

  it("does not cover non-app routes", () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal("document", { documentElement: { dataset } });
    vi.stubGlobal("location", { pathname: "/deloro/admin" });

    Function(getPwaLaunchPrepaintScript())();

    expect(dataset.pwaAppLaunch).toBe("false");
    expect(dataset.pwaStartupReady).toBe("true");
  });

  it("defines the document background and launch shell without external CSS or fonts", () => {
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("html, body");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("background: #f8fafc");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("html.dark");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain(
      'html[data-pwa-app-launch="true"]'
    );
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain(
      "system-ui, -apple-system, sans-serif"
    );
    expect(PWA_LAUNCH_CRITICAL_CSS).not.toContain("@import");
  });
});
