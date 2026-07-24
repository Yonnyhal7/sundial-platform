import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("new sport icon appearance fields", () => {
  it("previews the selected icon with the live color value", () => {
    const source = read(
      "src/app/[school]/admin/athletics/sports/new/sport-appearance-fields.tsx"
    );

    expect(source).toContain('useState("generic")');
    expect(source).toContain("useState(DEFAULT_SPORT_ICON_COLOR)");
    expect(source).toContain("onChange={(event) => setIcon(event.target.value)}");
    expect(source).toContain("onChange={(event) => setIconColor(event.target.value)}");
    expect(source).toContain("<SportIcon icon={icon} color={iconColor}");
    expect(source).toContain('aria-live="polite"');
  });

  it("keeps the submitted field names compatible with the existing server action", () => {
    const source = read(
      "src/app/[school]/admin/athletics/sports/new/sport-appearance-fields.tsx"
    );

    expect(source).toContain('name="icon"');
    expect(source).toContain('name="icon_color"');
  });
});
