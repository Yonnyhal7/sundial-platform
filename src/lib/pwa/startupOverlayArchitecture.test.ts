import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PWA_LAUNCH_CRITICAL_CSS, PWA_LAUNCH_VISUAL } from "./launchScreen";

const read = (path: string) => readFileSync(path, "utf8");
const rootLayout = read("src/app/layout.tsx");
const appLayout = read("src/app/[school]/app/layout.tsx");
const launchScreen = read("src/components/pwa/PwaLaunchScreen.tsx");
const boundary = read("src/components/pwa/PwaStartupBoundary.tsx");
const coordinator = read("src/lib/pwa/startupCoordinator.ts");

describe("PWA launch overlay architecture", () => {
  it("server-renders the launch shell in the root layout body", () => {
    // Present in the first flushed chunk: outside the Suspense boundary that
    // wraps the async tenant tree, so no data fetch can delay it.
    expect(rootLayout).toContain("<PwaLaunchScreen />");
    expect(rootLayout.indexOf("<PwaLaunchScreen")).toBeLessThan(
      rootLayout.indexOf("<Suspense")
    );
    expect(launchScreen).not.toContain('"use client"');
    expect(launchScreen).not.toContain("useEffect");
    expect(launchScreen).not.toContain("useState");
    expect(launchScreen).not.toContain("next/dynamic");
  });

  it("needs no network request, hydration or client effect to appear", () => {
    // Styling is inline critical CSS, not a stylesheet request.
    expect(rootLayout).toContain("__html: PWA_LAUNCH_CRITICAL_CSS");
    expect(PWA_LAUNCH_CRITICAL_CSS).not.toContain("@import");
    expect(PWA_LAUNCH_CRITICAL_CSS).not.toContain("url(");
    // Bundled local logo, not a tenant/remote asset, preloaded from the head so
    // it does not depend on next/image hoisting or a JS chunk.
    expect(PWA_LAUNCH_VISUAL.iconSrc.startsWith("/")).toBe(true);
    expect(PWA_LAUNCH_VISUAL.iconSrc).not.toContain("://");
    expect(launchScreen).toContain("priority");
    expect(rootLayout).toContain('rel="preload"');
    expect(rootLayout).toContain('as="image"');
    expect(rootLayout).toContain("href={PWA_LAUNCH_VISUAL.iconSrc}");
    // The mark must stay small enough to arrive with the first frame.
    const markBytes = readFileSync(`public${PWA_LAUNCH_VISUAL.iconSrc}`).length;
    expect(markBytes).toBeLessThan(64 * 1024);
    // Intrinsic dimensions are declared, so the card cannot shift on decode.
    expect(PWA_LAUNCH_VISUAL.markWidth).toBeGreaterThan(0);
    expect(PWA_LAUNCH_VISUAL.markHeight).toBeGreaterThan(0);
    // No Supabase, IndexedDB, auth or audience dependency in the shell itself.
    for (const forbidden of [
      "supabase",
      "indexedDB",
      "loadSchoolSnapshot",
      "fetch(",
      "useOfflineSchoolData",
    ]) {
      expect(launchScreen).not.toContain(forbidden);
    }
  });

  it("renders the application tree beneath the overlay rather than replacing it", () => {
    expect(boundary).toContain("<div data-pwa-startup-state={startup.state}>{children}</div>");
    // The tree must not be hidden, unmounted or gated behind readiness.
    expect(boundary).not.toContain("visibility:");
    expect(boundary).not.toContain("appDestinationMounted");
    expect(boundary).not.toContain("aria-hidden={!showApp}");
    expect(boundary).not.toMatch(/showApp\s*&&\s*children/);
  });

  it("keeps the overlay above the interface with standalone-safe insets", () => {
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("position: fixed");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("inset: 0");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("z-index: 2147483646");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("min-height: 100dvh");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("env(safe-area-inset-top)");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain("env(safe-area-inset-bottom)");
  });

  it("uses intentional Sundial colours in both appearances and never black", () => {
    expect(PWA_LAUNCH_VISUAL.background).toBe("#f8fafc");
    expect(PWA_LAUNCH_VISUAL.backgroundDark).toBe("#101214");
    expect(PWA_LAUNCH_CRITICAL_CSS).toContain(
      `html.dark #sundial-pwa-launch`
    );
    for (const source of [
      PWA_LAUNCH_CRITICAL_CSS,
      rootLayout,
      appLayout,
      launchScreen,
    ]) {
      expect(source).not.toContain("#000000");
    }
  });

  it("gates removal on shell readiness, not on background work", () => {
    expect(coordinator).toContain("export function isPwaShellReady");
    expect(boundary).toContain("isPwaShellReady(startup.state)");
    // The audience lookup records a result but never drives readiness.
    expect(coordinator).toContain(
      "// Recorded for onboarding, never for readiness."
    );
    expect(coordinator).not.toContain('"retry_required"');
    expect(coordinator).not.toContain('"checking_audience"');
  });

  it("cannot leave the overlay visible when startup work fails", () => {
    // Every wait has a ceiling: wedged IndexedDB, stuck route fallback and a
    // frame callback that never fires in a throttled tab.
    expect(boundary).toContain("CACHE_PROBE_FAILSAFE_MS");
    expect(boundary).toContain("ROUTE_FALLBACK_MAX_WAIT_MS");
    expect(boundary).toContain("PAINT_HANDOFF_FALLBACK_MS");
    expect(boundary).toContain('dispatch({ type: "cache_probe_abandoned" })');
    expect(boundary).toContain(
      'typeof window.requestAnimationFrame !== "function"'
    );
    // Offline with no snapshot resolves to an actionable screen, not a loader.
    expect(boundary).toContain("Connect to finish opening Sundial");
  });

  it("reveals an interface that is already rendered", () => {
    expect(boundary.indexOf('recordOnce("stable_destination_painted"')).toBeLessThan(
      boundary.indexOf("hidePwaLaunchScreen(")
    );
    expect(boundary).toContain("window.requestAnimationFrame(() => {");
    expect(boundary).toContain("hidePwaLaunchScreen(");
  });

  it("introduces no artificial minimum launch duration", () => {
    // Ceilings are allowed; floors are not. A ready shell must hand off on the
    // next painted frame, never after a timer.
    expect(boundary).not.toMatch(/setTimeout\(\s*completeHandoff/);
    expect(boundary).not.toMatch(/setTimeout\(\(\)\s*=>\s*completeHandoff/);
    expect(boundary).toContain("      completeHandoff();");
    // The only timers in the handoff are the documented failure ceilings.
    const timerTargets = [...boundary.matchAll(/setTimeout\(\s*([A-Za-z]+)/g)].map(
      (match) => match[1]
    );
    expect(new Set(timerTargets)).toEqual(new Set(["finish", "stopWaiting"]));
  });
});
