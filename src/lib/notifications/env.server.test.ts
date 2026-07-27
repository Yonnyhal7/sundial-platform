import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getPushEnvironment, requireCronAuthorization } from "./env.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("notification production configuration", () => {
  it("accepts only the configured bearer cron secret", () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");
    expect(requireCronAuthorization("Bearer expected-secret")).toBe(true);
    expect(requireCronAuthorization("Bearer wrong-secret")).toBe(false);
    expect(requireCronAuthorization(null)).toBe(false);
  });

  it("rejects cron requests when the secret is absent", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(requireCronAuthorization("Bearer expected-secret")).toBe(false);
  });

  it("requires a complete VAPID configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "mailto:notifications@example.com");
    expect(() => getPushEnvironment()).toThrow(
      "Push notification environment is not configured"
    );
  });

  it("accepts a complete VAPID configuration with a valid subject", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:notifications@example.com");
    expect(getPushEnvironment()).toEqual({
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "mailto:notifications@example.com",
    });
  });
});
