import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
});
