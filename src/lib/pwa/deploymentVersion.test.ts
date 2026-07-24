import { afterEach, describe, expect, it } from "vitest";
import { getPwaDeploymentVersion } from "./deploymentVersion";

const originalDeploymentId = process.env.VERCEL_DEPLOYMENT_ID;
const originalCommitSha = process.env.VERCEL_GIT_COMMIT_SHA;
const originalPublicVersion =
  process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnvironment("VERCEL_DEPLOYMENT_ID", originalDeploymentId);
  restoreEnvironment("VERCEL_GIT_COMMIT_SHA", originalCommitSha);
  restoreEnvironment(
    "NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION",
    originalPublicVersion
  );
});

describe("PWA deployment version", () => {
  it("prefers the Vercel deployment identity", () => {
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_current";
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    delete process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION;
    expect(getPwaDeploymentVersion()).toBe("dpl_current");
  });

  it("falls back to the deployed commit and disables itself locally", () => {
    delete process.env.VERCEL_DEPLOYMENT_ID;
    delete process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION;
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    expect(getPwaDeploymentVersion()).toBe("abc123");
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    expect(getPwaDeploymentVersion()).toBeNull();
  });

  it("uses the build-injected deployment identity", () => {
    process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION = "build-identity";
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_current";
    expect(getPwaDeploymentVersion()).toBe("build-identity");
  });
});
