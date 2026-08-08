import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile app theme synchronization", () => {
  const provider = read(
    "src/components/mobile-app/MobileAppThemeProvider.tsx"
  );
  const header = read("src/components/mobile-app/AppHeader.tsx");
  const layout = read("src/app/[school]/app/layout.tsx");
  const rootLayout = read("src/app/layout.tsx");
  const drawer = read("src/components/mobile-app/OverlayDrawer.tsx");
  const globals = read("src/app/globals.css");
  const lifecycle = read("src/lib/pwa/mobileThemeSurface.ts");

  it("uses one app-wide appearance owner for the open drawer and shell", () => {
    expect(layout).toContain("<MobileAppThemeProvider");
    expect(layout).not.toContain("<ThemeRouteSync");
    expect(header).toContain("useMobileAppTheme()");
    expect(header).not.toContain("useState<AppearancePreference>");
  });

  it.each(["light", "dark"])(
    "applies %s to the document before the drawer closes",
    (theme) => {
      expect(provider).toContain('applyTheme(nextTheme, "app", nextAppearance)');
      expect(provider).toContain("data-app-resolved-theme={resolvedTheme}");
      expect(header).toContain("setAppearance(nextAppearance)");
      expect(header).not.toContain("closeMenu();");
      expect(theme).toMatch(/light|dark/);
    }
  );

  it("resolves System immediately and follows later device changes", () => {
    expect(provider).toContain("resolveAppearanceTheme(nextAppearance)");
    expect(provider).toContain('appearance !== "system"');
    expect(provider).toContain('event.matches ? "dark" : "light"');
  });

  it("invalidates mounted shell styles without waiting for the root class repaint", () => {
    expect(globals).toContain('[data-app-resolved-theme="dark"] *');
    expect(globals).toContain(
      '.mobile-app-theme[data-app-resolved-theme="dark"]'
    );
  });

  it("updates the installed-PWA theme color with the resolved theme", () => {
    expect(lifecycle).toContain('meta[name="theme-color"]');
    expect(provider).toContain("PWA_LAUNCH_VISUAL.backgroundDark");
    expect(provider).toContain("applyMobileThemeSurface(nextTheme)");
    expect(lifecycle).toContain("documentElement.style.backgroundColor");
    expect(lifecycle).toContain("body.style.backgroundColor");
    expect(provider).toContain('data-pwa-status-bar-background=""');
    expect(provider).toContain("h-[env(safe-area-inset-top)]");
    expect(rootLayout).toContain('viewportFit: "cover"');
    expect(layout).toContain('viewportFit: "cover"');
  });

  it("re-resolves and reapplies every mobile theme surface after foreground restore", () => {
    expect(provider).toContain("resolveAppearanceTheme(appearance)");
    expect(provider).toContain("bindMobileThemeSurfaceLifecycle");
    expect(lifecycle).toContain('documentTarget.addEventListener("visibilitychange"');
    expect(lifecycle).toContain('windowTarget.addEventListener("pageshow"');
    expect(lifecycle).not.toContain('addEventListener("focus"');
  });

  it("covers the safe area while keeping drawer content below it", () => {
    expect(drawer).toContain("fixed inset-0");
    expect(drawer).toContain("absolute inset-y-0");
    expect(drawer).toContain("pt-[env(safe-area-inset-top)]");
    expect(drawer).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(drawer).toContain("box-border");
  });

  it("persists the authoritative preference with the tenant key", () => {
    expect(provider).toContain(
      'setStoredAppearancePreference("app", nextAppearance, school)'
    );
  });
});
