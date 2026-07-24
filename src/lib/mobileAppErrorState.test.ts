import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const errorState = readFileSync(
  join(process.cwd(), "src/app/[school]/app/error.tsx"),
  "utf8"
);

describe("mobile app route error state", () => {
  it("keeps recovery inside the installed app route boundary", () => {
    expect(errorState).toContain('"use client"');
    expect(errorState).toContain("onClick={reset}");
    expect(errorState).toContain('role="alert"');
    expect(errorState).toContain("min-h-11");
    expect(errorState).not.toContain("window.location");
    expect(errorState).not.toContain('href={`/${school}`}');
  });
});
