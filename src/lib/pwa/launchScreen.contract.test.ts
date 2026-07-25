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
  });

  it("reveals after cache hydration rather than waiting for network refresh", () => {
    expect(offlineData).toContain("cacheHydrated: boolean");
    expect(offlineData).toContain("setCacheHydrated(true)");
    expect(runtime).toContain("if (cacheHydrated) reveal()");
    expect(runtime).toContain("PWA_LAUNCH_MAX_MS");
    expect(runtime).toContain('"recovery_required"');
    expect(runtime).toContain('"cached_snapshot_ready"');
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
  });
});
