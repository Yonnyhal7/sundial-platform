import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdvancedAiImportEnabled } from "../constants/featureFlag";

describe("advanced AI import feature flag", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is available by default", () => {
    vi.stubEnv("ENABLE_ADVANCED_AI_IMPORT", undefined);
    expect(isAdvancedAiImportEnabled()).toBe(true);
  });

  it("is disabled only when explicitly set to false", () => {
    vi.stubEnv("ENABLE_ADVANCED_AI_IMPORT", "false");
    expect(isAdvancedAiImportEnabled()).toBe(false);
  });
});
