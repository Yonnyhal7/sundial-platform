import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canOptimizeSchoolLogo, getSchoolLogoImageSizes } from "./SchoolLogo";

const source = readFileSync(
  resolve(process.cwd(), "src/components/SchoolLogo.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("public school logo rendering contract", () => {
  it("contains and centers uploaded artwork without clipping its wrapper", () => {
    expect(source).toContain('"object-contain object-center"');
    expect(source).toContain(
      'allowArtworkOverflow ? "overflow-visible" : "overflow-hidden"',
    );
    expect(source).not.toContain('"object-cover"');
  });

  it("optimizes public Supabase school logos for their rendered size", () => {
    expect(source).toContain('url.hostname.endsWith(".supabase.co")');
    expect(source).toContain(
      'url.pathname.startsWith("/storage/v1/object/public/school-logos/")',
    );
    expect(source).toContain("width={160}");
    expect(source).toContain("height={160}");
    expect(source).toContain("sizes={getSchoolLogoImageSizes(variant, size)}");
    expect(source).toContain('appHeader: "(max-width: 480px) 37px, 49px"');
    expect(
      canOptimizeSchoolLogo(
        "https://project.supabase.co/storage/v1/object/public/school-logos/schools/tenant/logo.webp",
      ),
    ).toBe(true);
    expect(getSchoolLogoImageSizes("appHeader", "md")).toBe(
      "(max-width: 480px) 37px, 49px",
    );
  });

  it("retains the direct-image compatibility path for legacy external logos", () => {
    expect(source).toContain(
      "unoptimized={!canOptimizeSchoolLogo(uploadedLogoUrl)}",
    );
    expect(canOptimizeSchoolLogo("https://assets.example.com/logo.png")).toBe(
      false,
    );
    expect(
      canOptimizeSchoolLogo(
        "https://project.supabase.co/storage/v1/object/public/other-bucket/logo.png",
      ),
    ).toBe(false);
    expect(canOptimizeSchoolLogo("not a URL")).toBe(false);
  });

  it("continues clipping only the bounded fallback badge", () => {
    expect(source).toContain("overflow-hidden rounded-2xl");
  });
});
