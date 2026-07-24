import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getPwaDeploymentVersion } from "./deploymentVersion";

const originalPublicVersion =
  process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnvironment(
    "NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION",
    originalPublicVersion
  );
});

describe("PWA deployment version", () => {
  it("disables the endpoint when no opaque build identity was injected", () => {
    delete process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION;
    expect(getPwaDeploymentVersion()).toBeNull();
  });

  it("uses the build-injected deployment identity", () => {
    process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION = "build-identity";
    expect(getPwaDeploymentVersion()).toBe("build-identity");
  });

  it("does not expose Vercel or Git commit identifiers", () => {
    const source = readFileSync(
      "src/lib/pwa/deploymentVersion.ts",
      "utf8"
    );
    expect(source).not.toContain("VERCEL_");
    expect(source).not.toContain("GIT_COMMIT");
  });
});
