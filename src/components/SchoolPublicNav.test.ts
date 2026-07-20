import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/SchoolPublicNav.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");

describe("public mobile navigation accessibility", () => {
  it("exposes an accessible toggle and Escape dismissal", () => {
    expect(source).toContain('aria-expanded={open}');
    expect(source).toContain('aria-controls="public-mobile-menu"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('window.addEventListener("keydown", handleKeyDown)');
  });

  it("keeps mobile targets large and desktop navigation breakpoint-scoped", () => {
    expect(source).toContain("h-11 w-11");
    expect(source).toContain("min-h-12");
    expect(source).toContain("xl:hidden");
    expect(source).toContain("hidden items-center gap-1 xl:flex");
  });

  it("keeps appearance out of the header and opens it from the mobile menu", () => {
    expect(source).not.toContain("ThemeToggle");
    expect(source).toContain('aria-haspopup="dialog"');
    expect(source).toContain('aria-label="Website appearance"');
    expect(source).toContain('setStoredAppearancePreference("site"');
    expect(source).toContain('applyTheme(resolveAppearanceTheme(nextAppearance), "site"');
    expect(source).not.toContain('variant="segmented"');
  });

  it("renders a fixed overlay with backdrop dismissal and focus management", () => {
    expect(source).toContain("fixed inset-x-0 bottom-0 top-20");
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain("public-mobile-menu-panel");
  });

  it("uses existing icons and includes public navigation identity", () => {
    expect(source).toContain("HomeIcon");
    expect(source).toContain("MegaphoneIcon");
    expect(source).toContain("ResourcesIcon");
    expect(source).toContain("Powered by Sundial");
    expect(source).toContain('className="h-14 w-14 p-1"');
  });
});
