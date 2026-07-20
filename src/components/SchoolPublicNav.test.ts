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
    expect(source).toContain('window.addEventListener("keydown", closeOnEscape)');
  });

  it("keeps mobile targets large and desktop navigation breakpoint-scoped", () => {
    expect(source).toContain("h-11 w-11");
    expect(source).toContain("min-h-11");
    expect(source).toContain("xl:hidden");
    expect(source).toContain("hidden items-center gap-1 xl:flex");
  });
});
