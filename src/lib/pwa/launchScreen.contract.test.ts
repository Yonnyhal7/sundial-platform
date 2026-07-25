import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("installed PWA loading screen integration", () => {
  const launchScreen = source("src/components/pwa/PwaLaunchScreen.tsx");
  const runtime = source(
    "src/components/offline/OfflineStudentAppRuntime.tsx"
  );
  const startupBoundary = source(
    "src/components/pwa/PwaStartupBoundary.tsx"
  );
  const offlineData = source("src/lib/offline/useOfflineSchoolData.tsx");
  const appLayout = source("src/app/[school]/app/layout.tsx");
  const serviceWorkerRegister = source(
    "src/components/offline/ServiceWorkerRegister.tsx"
  );

  it("server-renders one accessible tenant-aware launch shell", () => {
    expect(appLayout.match(/<PwaLaunchScreen/g)).toHaveLength(1);
    expect(appLayout).toContain("schoolName={schoolData.name}");
    expect(appLayout).toContain("primaryColor={schoolData.primary_color}");
    expect(launchScreen).toContain('role="status"');
    expect(launchScreen).toContain("Loading ${resolvedName}");
    expect(launchScreen).toContain('src="/sundial-icon.png"');
  });

  it("keeps light, dark, safe-area, and reduced-motion behavior in critical CSS", () => {
    expect(launchScreen).toContain(`html.dark #\${PWA_LAUNCH_SCREEN_ID}`);
    expect(launchScreen).toContain("color-scheme: light");
    expect(launchScreen).toContain("color-scheme: dark");
    expect(launchScreen).toContain("env(safe-area-inset-top)");
    expect(launchScreen).toContain("env(safe-area-inset-bottom)");
    expect(launchScreen).toContain("prefers-reduced-motion: reduce");
    expect(launchScreen).toContain("html, body");
    expect(launchScreen).toContain("system-ui, -apple-system");
    expect(launchScreen).toContain("prepaint_shell_shown");
  });

  it("hands off only after cache and audience readiness resolve", () => {
    expect(offlineData).toContain("cacheHydrated: boolean");
    expect(offlineData).toContain("setCacheHydrated(true)");
    expect(startupBoundary).toContain("cacheHydrated");
    expect(startupBoundary).toContain("audience_lookup_started");
    expect(startupBoundary).toContain("onboarding_required");
    expect(startupBoundary).toContain("hidePwaLaunchScreen");
    expect(runtime).not.toContain("hidePwaLaunchScreen");
    expect(runtime).not.toContain("PWA_LAUNCH_MAX_MS");
  });

  it("covers a confirmed reload before the controlled reload paints", () => {
    expect(serviceWorkerRegister).toContain(
      "prepareForReload: preparePwaLaunchScreenForReload"
    );
    expect(source("src/lib/pwa/updateLifecycle.ts")).toContain(
      "const preparation = options.prepareForReload?.()"
    );
  });

  it("does not alter service worker, notification, or manifest behavior", () => {
    expect(appLayout).toContain("getSchoolAppManifestPath");
    expect(appLayout).toContain("apple-touch-icon.png");
    expect(serviceWorkerRegister).not.toContain("push");
    expect(runtime).not.toContain("notification");
    expect(startupBoundary).not.toContain("serviceWorker");
  });
});
