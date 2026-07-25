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
  const rootLayout = source("src/app/layout.tsx");
  const launchRuntime = source("src/lib/pwa/launchScreen.ts");
  const serviceWorkerRegister = source(
    "src/components/offline/ServiceWorkerRegister.tsx"
  );

  it("server-renders one root launch shell before async school layout work", () => {
    expect(rootLayout.match(/<PwaLaunchScreen/g)).toHaveLength(1);
    expect(appLayout).not.toContain("<PwaLaunchScreen");
    expect(rootLayout.indexOf("<PwaLaunchScreen")).toBeLessThan(
      rootLayout.indexOf("{children}")
    );
    expect(launchScreen).toContain('role="status"');
    expect(launchScreen).toContain("Opening your school app");
    expect(launchScreen).toContain('src="/sundial-icon.png"');
    expect(launchScreen).toContain("server_launch_shell_present");
  });

  it("keeps light, dark, safe-area, and reduced-motion behavior in critical CSS", () => {
    expect(rootLayout.indexOf("__html: getThemeBootstrapScript()")).toBeLessThan(
      rootLayout.indexOf("__html: PWA_LAUNCH_CRITICAL_CSS")
    );
    expect(launchRuntime).toContain(`html.dark #\${PWA_LAUNCH_SCREEN_ID}`);
    expect(launchRuntime).toContain("color-scheme: light");
    expect(launchRuntime).toContain("color-scheme: dark");
    expect(launchRuntime).toContain("env(safe-area-inset-top)");
    expect(launchRuntime).toContain("env(safe-area-inset-bottom)");
    expect(launchRuntime).toContain("prefers-reduced-motion: reduce");
    expect(launchRuntime).toContain("html, body");
    expect(launchRuntime).toContain("system-ui, -apple-system");
    expect(launchScreen).toContain("prepaint_shell_shown");
  });

  it("hands off only after cache and audience readiness resolve", () => {
    expect(offlineData).toContain("cacheHydrated: boolean");
    expect(offlineData).toContain("setCacheHydrated(true)");
    expect(startupBoundary).toContain("cacheHydrated");
    expect(startupBoundary).toContain("audience_lookup_started");
    expect(startupBoundary).toContain("onboarding_required");
    expect(startupBoundary).toContain('type: "onboarding_completed"');
    expect(startupBoundary).toContain("hidePwaLaunchScreen");
    expect(startupBoundary).toContain("showApp");
    expect(startupBoundary).toContain("showRecovery");
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
    expect(serviceWorkerRegister).toContain("isStartupInProgress");
    expect(source("src/lib/pwa/updateLifecycle.ts")).toContain(
      '"startup_in_progress"'
    );
  });

  it("does not alter service worker, notification, or manifest behavior", () => {
    expect(appLayout).toContain("getSchoolAppManifestPath");
    expect(appLayout).toContain("apple-touch-icon.png");
    expect(serviceWorkerRegister).not.toContain("push");
    expect(runtime).not.toContain("notification");
    expect(startupBoundary).not.toContain("serviceWorker");
  });

  it("keeps onboarding and permission transitions under the startup authority", () => {
    const header = source("src/components/mobile-app/AppHeader.tsx");
    const onboarding = source(
      "src/components/mobile-app/NotificationAudienceOnboarding.tsx"
    );

    expect(header).not.toContain("NotificationAudienceOnboarding");
    expect(startupBoundary.match(/<NotificationAudienceOnboarding/g)).toHaveLength(1);
    expect(onboarding).toContain("audience_selected");
    expect(onboarding).toContain("notification_permission_requested");
    expect(onboarding).toContain("notification_permission_result");
    expect(onboarding.indexOf('setStage("done")')).toBeLessThan(
      onboarding.indexOf("onComplete(audience)")
    );
  });
});
