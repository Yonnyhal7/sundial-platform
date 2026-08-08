import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile app theme synchronization", () => {
  const provider = read(
    "src/components/mobile-app/MobileAppThemeProvider.tsx"
  );
  const header = read("src/components/mobile-app/AppHeader.tsx");
  const layout = read("src/app/[school]/app/layout.tsx");

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

  it("persists the authoritative preference with the tenant key", () => {
    expect(provider).toContain(
      'setStoredAppearancePreference("app", nextAppearance, school)'
    );
  });
});
