import { afterEach, describe, expect, it, vi } from "vitest";
import { getThemeBootstrapScript } from "@/lib/themeBootstrap";

function runBootstrap({
  pathname = "/app",
  hostname = "davids.sundialk12.com",
  storedPreference,
  systemDark = false,
  options,
}: {
  pathname?: string;
  hostname?: string;
  storedPreference?: "light" | "dark" | "system";
  systemDark?: boolean;
  options?: Parameters<typeof getThemeBootstrapScript>[0];
} = {}) {
  const values = new Map<string, string>();
  if (storedPreference) {
    values.set("sundial:pwa:appearance:davids", storedPreference);
  }
  const classes = new Set<string>();
  const root = {
    classList: {
      toggle(name: string, force: boolean) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
  };
  const sessionValues = new Map<string, string>();
  const windowObject = {
    location: { pathname, hostname },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    sessionStorage: {
      setItem: (key: string, value: string) => sessionValues.set(key, value),
    },
    matchMedia: () => ({ matches: systemDark }),
  };
  const documentObject = {
    documentElement: root,
    visibilityState: "visible",
  };

  vi.stubGlobal("window", windowObject);
  vi.stubGlobal("document", documentObject);
  Function(getThemeBootstrapScript(options))();

  return { classes, root, sessionValues };
}

describe("pre-hydration theme bootstrap", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["light", false],
    ["dark", true],
  ] as const)("applies saved %s before hydration", (preference, expectsDark) => {
    const { classes, root } = runBootstrap({
      storedPreference: preference,
      systemDark: !expectsDark,
    });

    expect(classes.has("dark")).toBe(expectsDark);
    expect(root.dataset.themeScope).toBe("app");
    expect(root.dataset.themePreference).toBe(preference);
    expect(root.style.colorScheme).toBe(expectsDark ? "dark" : "light");
  });

  it.each([
    [false, false],
    [true, true],
  ] as const)(
    "resolves System against the current device appearance (%s)",
    (systemDark, expectsDark) => {
      const { classes, root } = runBootstrap({
        storedPreference: "system",
        systemDark,
      });

      expect(classes.has("dark")).toBe(expectsDark);
      expect(root.dataset.themePreference).toBe("system");
    }
  );

  it("uses the school default when no tenant preference exists", () => {
    const { classes, root } = runBootstrap({
      options: {
        scope: "app",
        schoolSlug: "davids",
        schoolDefaultAppearance: "dark",
      },
    });

    expect(classes.has("dark")).toBe(true);
    expect(root.dataset.themePreference).toBe("dark");
  });

  it("keeps bounded diagnostics without tenant or user data", () => {
    const { sessionValues } = runBootstrap({ storedPreference: "dark" });
    const diagnostics = JSON.parse(
      sessionValues.get("sundial:pwa-resume-diagnostics") || "[]"
    ) as Array<Record<string, unknown>>;

    expect(diagnostics.map((event) => event.type)).toEqual([
      "theme_read",
      "theme_class_applied",
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("davids");
  });
});
