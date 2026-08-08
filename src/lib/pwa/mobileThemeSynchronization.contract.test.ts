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
  const globals = read("src/app/globals.css");

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
    expect(provider).toContain('meta[name="theme-color"]');
    expect(provider).toContain("PWA_LAUNCH_VISUAL.backgroundDark");
    expect(provider).toContain("updatePwaThemeColor(nextTheme)");
    expect(provider).toContain("document.documentElement.style.backgroundColor");
    expect(provider).toContain("document.body.style.backgroundColor");
    expect(provider).toContain('data-pwa-status-bar-background=""');
    expect(provider).toContain("h-[env(safe-area-inset-top)]");
    expect(rootLayout).toContain('viewportFit: "cover"');
    expect(layout).toContain('viewportFit: "cover"');
  });

  it("persists the authoritative preference with the tenant key", () => {
    expect(provider).toContain(
      'setStoredAppearancePreference("app", nextAppearance, school)'
    );
  });
});
