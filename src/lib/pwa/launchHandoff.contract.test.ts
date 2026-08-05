import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const boundary = read("src/components/pwa/PwaStartupBoundary.tsx");
const launch = read("src/components/pwa/PwaLaunchScreen.tsx");
const visual = read("src/lib/pwa/launchScreen.ts");
const manifest = read("src/lib/pwa/schoolAppManifest.ts");
const rootLoading = read("src/app/[school]/app/loading.tsx");
const athleticsLoading = read("src/app/[school]/app/athletics/loading.tsx");
const eventsLoading = read("src/app/[school]/app/events/loading.tsx");

describe("PWA unified launch handoff", () => {
  it("uses one shared launch visual specification", () => {
    expect(visual).toContain("PWA_LAUNCH_VISUAL");
    expect(launch).toContain("PWA_LAUNCH_VISUAL.title");
    expect(launch).toContain("PWA_LAUNCH_VISUAL.copy");
    expect(launch).toContain("PWA_LAUNCH_VISUAL.markWidth");
    expect(manifest).toContain("PWA_LAUNCH_VISUAL.background");
    expect(launch.match(/id=\{PWA_LAUNCH_SCREEN_ID\}/g)).toHaveLength(1);
  });

  it("marks every initial App Router fallback without adding another overlay", () => {
    for (const loading of [rootLoading, athleticsLoading, eventsLoading]) {
      expect(loading).toContain('data-pwa-route-loading="true"');
      expect(loading).not.toContain("PwaLaunchScreen");
    }
  });

  it("keeps the root overlay until route loading has left the DOM", () => {
    expect(boundary).toContain("ROUTE_LOADING_SELECTOR");
    expect(boundary).toContain("new MutationObserver");
    expect(boundary).toContain("document.querySelector(ROUTE_LOADING_SELECTOR)");
    expect(boundary.indexOf('recordOnce("stable_destination_painted"')).toBeLessThan(
      boundary.indexOf("hidePwaLaunchScreen(")
    );
    expect(boundary.indexOf("hidePwaLaunchScreen(")).toBeLessThan(
      boundary.indexOf('recordOnce("launch_shell_removed"')
    );
  });

  it("mounts the destination beneath the root overlay before handoff", () => {
    // The interface is always mounted and visible underneath the overlay; the
    // overlay is what covers it, so nothing is hidden or conditionally rendered.
    expect(boundary).toContain(
      "<div data-pwa-startup-state={startup.state}>{children}</div>"
    );
    expect(boundary).toContain(
      'const showRecovery = startup.state === "recovery_required"'
    );
    expect(boundary).toContain(
      "const showOnboarding = shouldShowAudienceOnboarding(startup)"
    );
    expect(boundary).not.toContain("visibility:");
  });

  it("records hydration, loader, stable-paint, and shell-removal milestones", () => {
    for (const diagnostic of [
      "react_hydration_start",
      "react_startup_boundary_mounted",
      "react_loader_rendered",
      "stable_destination_painted",
      "launch_shell_removed",
    ]) {
      expect(boundary).toContain(diagnostic);
    }
    expect(launch).toContain("root_shell_first_paint");
  });
});
