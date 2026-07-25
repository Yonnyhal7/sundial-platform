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

  it("keeps an always-dark, safe-area-aware, reduced-motion launch shell", () => {
    expect(rootLayout.indexOf("__html: getThemeBootstrapScript()")).toBeLessThan(
      rootLayout.indexOf("__html: PWA_LAUNCH_CRITICAL_CSS")
    );
    expect(launchRuntime).toContain(
      'html[data-pwa-app-launch="true"][data-pwa-launch="pending"]'
    );
    expect(launchRuntime).toContain("color-scheme: dark");
    expect(launchRuntime).toContain('background: "#000000"');
    expect(launchRuntime).toContain('accent: "#f8c531"');
    expect(launchRuntime).toContain('track: "#374151"');
    expect(launchRuntime).toContain('copyColor: "#a1a1aa"');
    expect(launchRuntime).toContain('iconSrc: "/sundial-icon.png"');
    expect(launchRuntime).not.toContain(
      `html.dark #\${PWA_LAUNCH_SCREEN_ID}`
    );
    expect(launchRuntime).toContain("env(safe-area-inset-top)");
    expect(launchRuntime).toContain("env(safe-area-inset-bottom)");
    expect(launchRuntime).toContain("prefers-reduced-motion: reduce");
    expect(launchRuntime).toContain("html, body");
    expect(launchRuntime).toContain("system-ui, -apple-system");
    expect(launchScreen).toContain("prepaint_shell_shown");
  });

  it("keeps first-paint metadata and inline document backgrounds black", () => {
    expect(rootLayout).toContain("themeColor: PWA_LAUNCH_VISUAL.background");
    expect(rootLayout).toContain('colorScheme: "light dark"');
    expect(rootLayout).toContain('statusBarStyle: "black-translucent"');
    expect(rootLayout).toContain('"apple-mobile-web-app-capable": "yes"');
    expect(rootLayout).toContain(
      'name="apple-mobile-web-app-status-bar-style"'
    );
    expect(rootLayout).toContain('name="mobile-web-app-capable"');
    expect(rootLayout.match(/backgroundColor: PWA_LAUNCH_VISUAL.background/g)).toHaveLength(2);
    expect(appLayout).toContain("themeColor: PWA_LAUNCH_VISUAL.background");
    expect(appLayout).not.toContain("getSchoolAppThemeColor");
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
