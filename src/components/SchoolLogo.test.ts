import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/SchoolLogo.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");

describe("public school logo rendering contract", () => {
  it("contains and centers uploaded artwork without clipping its wrapper", () => {
    expect(source).toContain("max-h-full max-w-full object-contain object-center");
    expect(source).toContain('allowArtworkOverflow ? "overflow-visible" : "overflow-hidden"');
    expect(source).not.toContain('"object-cover"');
  });

  it("continues clipping only the bounded fallback badge", () => {
    expect(source).toContain("overflow-hidden rounded-2xl");
  });
});
