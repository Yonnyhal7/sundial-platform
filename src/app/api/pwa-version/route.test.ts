import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalDeploymentId = process.env.VERCEL_DEPLOYMENT_ID;
const originalPublicVersion =
  process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION;

afterEach(() => {
  if (originalDeploymentId === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
  else process.env.VERCEL_DEPLOYMENT_ID = originalDeploymentId;
  if (originalPublicVersion === undefined) {
    delete process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION;
  } else {
    process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION =
      originalPublicVersion;
  }
});

describe("PWA deployment version route", () => {
  it("returns an uncached deployment identity", async () => {
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_test";
    delete process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION;
    const response = GET();

    expect(await response.json()).toEqual({ version: "dpl_test" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
