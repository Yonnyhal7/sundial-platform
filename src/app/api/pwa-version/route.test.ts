import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalPublicVersion =
  process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION;

afterEach(() => {
  if (originalPublicVersion === undefined) {
    delete process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION;
  } else {
    process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION =
      originalPublicVersion;
  }
});

describe("PWA deployment version route", () => {
  it("returns an uncached deployment identity", async () => {
    process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION =
      "opaque-build-version";
    const response = GET();

    expect(await response.json()).toEqual({
      version: "opaque-build-version",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
