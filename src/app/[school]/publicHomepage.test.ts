import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homepage = readFileSync(
  resolve(process.cwd(), "src/app/[school]/page.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");
const footer = readFileSync(
  resolve(process.cwd(), "src/components/public-site/PublicSite.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");
const navigation = readFileSync(
  resolve(process.cwd(), "src/components/SchoolPublicNav.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");

describe("public homepage mobile contracts", () => {
  it("keeps the hero compact on mobile and restores its desktop height", () => {
    expect(homepage).toContain("py-10 sm:py-14 lg:min-h-[34rem]");
    expect(homepage).toContain("mt-3 break-words");
    expect(homepage).toContain("min-h-12");
    expect(homepage).toContain('className="h-6 sm:hidden"');
  });

  it("uses real resources in a responsive two-column quick-link grid", () => {
    expect(homepage).toContain("data.resources.length > 0");
    expect(homepage).toContain("data.resources.slice(0, 8)");
    expect(homepage).toContain("grid grid-cols-2 gap-3 max-[340px]:grid-cols-1");
    expect(homepage).toContain("safePublicUrl(resource.url)");
  });

  it("uses institutional contact fields without presenting the current website", () => {
    expect(footer).toContain("school.address");
    expect(footer).toContain("school.phone_number");
    expect(footer).not.toContain("school_website");
    expect(footer).not.toContain("Contact the school office for location information.");
  });

  it("loads the School App as a fresh install document from every public entry point", () => {
    expect(homepage).toContain(
      '<SchoolAppInstallLink href={`/${slug}/app`}'
    );
    expect(footer).toContain(
      '<SchoolAppInstallLink href={`${base}/app`}>'
    );
    expect(navigation).toContain("installSurface: true");
  });
});
