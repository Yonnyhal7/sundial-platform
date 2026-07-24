import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  getSchoolSlugFromThemeLocation,
  getPreferredAppearance,
  getStoredAppearancePreference,
  getTenantThemeStorageKey,
  setStoredAppearancePreference,
} from "@/lib/themeScope";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("theme scope storage", () => {
  let localStorage: MemoryStorage;

  beforeEach(() => {
    localStorage = new MemoryStorage();
    vi.stubGlobal("window", {
      localStorage,
      matchMedia: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the tenant from production and localhost app hosts", () => {
    expect(
      getSchoolSlugFromThemeLocation("/app", "davids.sundialk12.com")
    ).toBe("davids");
    expect(getSchoolSlugFromThemeLocation("/app", "davids.localhost")).toBe(
      "davids"
    );
    expect(
      getSchoolSlugFromThemeLocation("/deloro/app", "localhost")
    ).toBe("deloro");
    expect(getSchoolSlugFromThemeLocation("/app", "admin.sundialk12.com")).toBeNull();
  });

  it("scopes PWA and kiosk storage keys by school slug", () => {
    expect(getTenantThemeStorageKey("app", "DelOro")).toBe(
      "sundial:pwa:appearance:deloro"
    );
    expect(getTenantThemeStorageKey("kiosk", "North")).toBe(
      "sundial:kiosk:appearance:north"
    );
    expect(getTenantThemeStorageKey("admin", "deloro")).toBe("sundial-theme-admin");
    expect(getTenantThemeStorageKey("site", "deloro")).toBe("sundial-theme-site");
  });

  it("keeps each school's PWA preference independent in the same browser", () => {
    setStoredAppearancePreference("app", "dark", "deloro");
    setStoredAppearancePreference("app", "light", "north");
    setStoredAppearancePreference("app", "system", "liberty");

    expect(getStoredAppearancePreference("app", "deloro")).toBe("dark");
    expect(getStoredAppearancePreference("app", "north")).toBe("light");
    expect(getStoredAppearancePreference("app", "liberty")).toBe("system");
  });

  it("migrates the old global PWA key once without seeding later tenants", () => {
    localStorage.setItem("sundial:pwa:appearance", "dark");

    expect(getStoredAppearancePreference("app", "deloro")).toBe("dark");
    expect(localStorage.getItem("sundial:pwa:appearance:deloro")).toBe("dark");
    expect(localStorage.getItem("sundial:pwa:appearance")).toBeNull();
    expect(getStoredAppearancePreference("app", "north")).toBeNull();
  });

  it("migrates old kiosk keys into the tenant-specific kiosk key", () => {
    localStorage.setItem("sundial:kiosk:appearance", "system");

    expect(getStoredAppearancePreference("kiosk", "deloro")).toBe("system");
    expect(localStorage.getItem("sundial:kiosk:appearance:deloro")).toBe("system");
    expect(localStorage.getItem("sundial:kiosk:appearance")).toBeNull();
  });

  it("defaults the global admin appearance to system before login", () => {
    expect(getPreferredAppearance("admin")).toBe("system");
  });

  it("persists admin light, dark, and system appearance choices locally", () => {
    setStoredAppearancePreference("admin", "light");
    expect(getStoredAppearancePreference("admin")).toBe("light");
    expect(getPreferredAppearance("admin")).toBe("light");

    setStoredAppearancePreference("admin", "dark");
    expect(getStoredAppearancePreference("admin")).toBe("dark");
    expect(getPreferredAppearance("admin")).toBe("dark");

    setStoredAppearancePreference("admin", "system");
    expect(getStoredAppearancePreference("admin")).toBe("system");
    expect(getPreferredAppearance("admin")).toBe("system");
  });

  it("keeps the document color scheme aligned with the applied class", () => {
    const toggle = vi.fn();
    vi.stubGlobal("document", {
      documentElement: {
        classList: { toggle },
        dataset: {},
        style: {},
      },
    });

    applyTheme("dark", "app", "dark");

    expect(toggle).toHaveBeenCalledWith("dark", true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.dataset.themePreference).toBe("dark");
  });
});
