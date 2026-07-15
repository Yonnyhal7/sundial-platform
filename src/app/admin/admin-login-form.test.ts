import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loginFormSource = readFileSync(
  new URL("./admin-login-form.tsx", import.meta.url),
  "utf8"
);
const themeToggleSource = readFileSync(
  new URL("../../components/ThemeToggle.tsx", import.meta.url),
  "utf8"
);

describe("admin login appearance", () => {
  it("uses the shared admin appearance toggle before authentication", () => {
    expect(loginFormSource).toContain("<ThemeToggle");
    expect(loginFormSource).toContain('scope="admin"');
    expect(loginFormSource).toContain('variant="segmented"');
  });

  it("brands the login card with the Sundial icon asset", () => {
    expect(loginFormSource).toContain('src="/sundial-icon.png"');
    expect(loginFormSource).toContain("Sundial Admin");
  });

  it("renders a deterministic hidden first paint until the saved theme is applied", () => {
    expect(loginFormSource).toContain("useState(false)");
    expect(loginFormSource).toContain("themeReady ? \"opacity-100\" : \"opacity-0\"");
    expect(loginFormSource).toContain("applyTheme(resolveAppearanceTheme(preference)");
  });

  it("keeps the login layout responsive and accessible", () => {
    expect(loginFormSource).toContain("min-h-dvh");
    expect(loginFormSource).toContain("w-full max-w-md");
    expect(loginFormSource).toContain('htmlFor="admin-login-email"');
    expect(loginFormSource).toContain('htmlFor="admin-login-password"');
    expect(loginFormSource).toContain('role="alert"');
  });

  it("supports keyboard operation for the segmented appearance control", () => {
    expect(themeToggleSource).toContain('role="radiogroup"');
    expect(themeToggleSource).toContain('role="radio"');
    expect(themeToggleSource).toContain('"ArrowRight"');
    expect(themeToggleSource).toContain('"ArrowLeft"');
    expect(themeToggleSource).toContain('"Home"');
    expect(themeToggleSource).toContain('"End"');
  });
});
