import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("PWA foreground theme stability contract", () => {
  it("initializes appearance before body content and does not defer it", () => {
    const rootLayout = read("src/app/layout.tsx");
    const bootstrap = read("src/lib/themeBootstrap.ts");

    expect(rootLayout.indexOf("getThemeBootstrapScript()")).toBeLessThan(
      rootLayout.indexOf("<body")
    );
    expect(bootstrap).not.toContain("setTimeout");
    expect(bootstrap).not.toContain("requestAnimationFrame");
  });

  it("keeps route freshness and application reload from mutating appearance", () => {
    const schoolRefresh = read("src/lib/offline/schoolDataRefreshLifecycle.ts");
    const updateLifecycle = read("src/lib/pwa/updateLifecycle.ts");

    expect(schoolRefresh).not.toContain("applyTheme");
    expect(updateLifecycle).not.toContain("applyTheme");
    expect(schoolRefresh).not.toContain("classList");
    expect(updateLifecycle).not.toContain("classList");
  });

  it("keeps background snapshot refresh silent when cached data is available", () => {
    const offlineData = read("src/lib/offline/useOfflineSchoolData.tsx");

    expect(offlineData).toContain(
      'if (!snapshotRef.current) {\n        setSyncState("syncing");'
    );
  });

  it("retains light and dark notification overlay surfaces", () => {
    const appHeader = read("src/components/mobile-app/AppHeader.tsx");

    expect(appHeader).toContain(
      "bg-slate-50 text-slate-950"
    );
    expect(appHeader).toContain("dark:bg-black dark:text-white");
    expect(appHeader).toContain("bg-white");
    expect(appHeader).toContain("dark:bg-[#242424]");
  });

  it("does not add a splash or motion-based masking transition", () => {
    const appLayout = read("src/app/[school]/app/layout.tsx");
    const rootLayout = read("src/app/layout.tsx");

    expect(`${appLayout}\n${rootLayout}`).not.toMatch(
      /theme-(?:splash|transition)|transition-theme|animate-theme/
    );
  });
});
