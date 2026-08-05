import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPwaLaunchPrepaintScript,
  PWA_LAUNCH_CRITICAL_CSS,
} from "@/lib/pwa/launchScreen";

afterEach(() => vi.unstubAllGlobals());

describe("PWA startup first frame", () => {
  function installPrepaint(pathname: string) {
    const dataset: Record<string, string> = {};
    const removeProperty = vi.fn();
    const root = { dataset, style: { removeProperty } };
    const stored = new Map<string, string>();
    vi.stubGlobal("document", {
      documentElement: root,
      visibilityState: "visible",
    });
    vi.stubGlobal("location", { pathname });
    vi.stubGlobal("performance", { now: () => 1 });
    vi.stubGlobal("sessionStorage", {
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    vi.stubGlobal("window", {});
    return { dataset, removeProperty, stored };
  }

  it.each(["/deloro/app", "/app"])(
    "marks %s for the server launch shell before paint",
    (pathname) => {
    const { dataset, stored } = installPrepaint(pathname);

    Function(getPwaLaunchPrepaintScript())();

    expect(dataset.pwaAppLaunch).toBe("true");
    expect(dataset.pwaLaunch).toBe("pending");
    expect(dataset.pwaStartupReady).toBe("false");
    expect(stored.get("sundial:pwa-resume-diagnostics")).toContain(
      "first_root_html_received"
    );
    }
  );

  it("does not cover non-app routes", () => {
    const { dataset, removeProperty } = installPrepaint("/deloro/admin");

    Function(getPwaLaunchPrepaintScript())();

    expect(dataset.pwaAppLaunch).toBe("false");
    expect(dataset.pwaStartupReady).toBe("true");
    expect(removeProperty).toHaveBeenCalledWith("background-color");
  });

  it("defines the document background and launch shell without external CSS or fonts", () => {
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("html, body");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("background: #f8fafc");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("background: #101214");
    expect(PWA_LAUNCH_CRITICAL_CSS).not.toContain("#000000");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("color-scheme: light");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("color-scheme: dark");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain(
      'html[data-pwa-app-launch="true"]'
    );
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain(
      "system-ui, -apple-system, sans-serif"
    );
    expect(PWA_LAUNCH_CRITICAL_CSS).not.toContain("@import");
  });

  it("only claims the document background while the launch shell is pending", () => {
    // An ungated `html, body { background }` rule overrides globals.css on every
    // route in the product, which is what produced the black screen everywhere.
    expect(PWA_LAUNCH_CRITICAL_CSS).not.toMatch(/html, body \{[^}]*background:/);
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain(
      'html[data-pwa-app-launch="true"][data-pwa-launch="pending"] body'
    );
  });
});
