import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PWA_LAUNCH_VISUAL } from "./launchScreen";

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
      rootLayout.indexOf("<Suspense")
    );
    expect(rootLayout).toContain("<Suspense fallback={null}>{children}</Suspense>");
    expect(launchScreen).toContain('role="status"');
    expect(launchRuntime).toContain("Opening your school app");
    expect(launchScreen).toContain("<Image");
    expect(launchScreen).toContain("PWA_LAUNCH_VISUAL.iconSrc");
    expect(launchScreen).toContain('import Image from "next/image"');
    expect(launchScreen).toContain("server_launch_shell_present");
  });

  it("keeps a branded, appearance-aware, safe-area-aware, reduced-motion launch shell", () => {
    expect(rootLayout.indexOf("__html: getThemeBootstrapScript()")).toBeLessThan(
      rootLayout.indexOf("__html: PWA_LAUNCH_CRITICAL_CSS")
    );
    expect(launchRuntime).toContain(
      'html[data-pwa-app-launch="true"][data-pwa-launch="pending"]'
    );
    expect(launchRuntime).toContain('accent: "#f8c531"');
    expect(launchRuntime).toContain('iconSrc: "/sundial-launch-mark.webp"');
    // The launch surface follows the resolved appearance, so a dark-mode user
    // never gets a bright flash and a light-mode user never gets a black one.
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

  it("never paints a black launch surface", () => {
    expect(PWA_LAUNCH_VISUAL.background).toBe("#f8fafc");
    expect(PWA_LAUNCH_VISUAL.backgroundDark).toBe("#101214");
    for (const value of Object.values(PWA_LAUNCH_VISUAL)) {
      expect(String(value).toLowerCase()).not.toBe("#000000");
      expect(String(value).toLowerCase()).not.toBe("#000");
    }
    // The document background must only be claimed while the launch shell is up;
    // an ungated rule would blacken (or wash out) every other route in Sundial.
    expect(launchRuntime).not.toMatch(/html, body \{[^}]*background:/);
    expect(rootLayout).not.toContain("backgroundColor: PWA_LAUNCH_VISUAL");
  });

  it("keeps first-paint metadata appearance-aware", () => {
    expect(rootLayout).toContain("(prefers-color-scheme: light)");
    expect(rootLayout).toContain("(prefers-color-scheme: dark)");
    expect(rootLayout).toContain("color: PWA_LAUNCH_VISUAL.background");
    expect(rootLayout).toContain("color: PWA_LAUNCH_VISUAL.backgroundDark");
    expect(rootLayout).toContain('colorScheme: "light dark"');
    expect(rootLayout).toContain('statusBarStyle: "black-translucent"');
    expect(rootLayout).toContain('"apple-mobile-web-app-capable": "yes"');
    expect(rootLayout).toContain(
      'name="apple-mobile-web-app-status-bar-style"'
    );
    expect(rootLayout).toContain('name="mobile-web-app-capable"');
    expect(appLayout).toContain("color: PWA_LAUNCH_VISUAL.background");
    expect(appLayout).toContain("color: PWA_LAUNCH_VISUAL.backgroundDark");
    expect(appLayout).not.toContain("getSchoolAppThemeColor");
  });

  it("gives the launch mark first-paint priority", () => {
    expect(launchScreen).toContain("priority");
    expect(launchScreen).toContain('fetchPriority="high"');
    expect(launchScreen).toContain("PWA_LAUNCH_VISUAL.markWidth");
    expect(launchScreen).toContain("PWA_LAUNCH_VISUAL.markHeight");
  });

  it("hands off to a destination while the audience sync continues behind it", () => {
    expect(offlineData).toContain("cacheHydrated: boolean");
    expect(offlineData).toContain("setCacheHydrated(true)");
    expect(startupBoundary).toContain("cacheHydrated");
    expect(startupBoundary).toContain("audience_lookup_started");
    expect(startupBoundary).toContain('type: "audience_selected"');
    expect(startupBoundary).toContain("hidePwaLaunchScreen");
    expect(startupBoundary).toContain("hasPwaDestination");
    expect(startupBoundary).toContain("showRecovery");
    // The destination comes from local state; the network sync only reconciles.
    expect(startupBoundary).toContain("resolveLocalAudienceState");
    expect(startupBoundary).toContain('type: "audience_sync_completed"');
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
