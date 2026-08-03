import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  activeProvider: "resend",
  version: 4,
  saveFailure: null as "returned" | "thrown" | "structured" | null,
  unconfiguredProvider: null as "google_workspace" | "resend" | null,
}));

const { requireSuperAdminAccess } = vi.hoisted(() => ({ requireSuperAdminAccess: vi.fn(async () => ({
  profile: { id: "00000000-0000-4000-8000-000000000001" },
  supabase: {
    rpc: vi.fn(async (_name: string, args: { p_expected_version: number; p_values: { school_setup_email_provider: string } }) => {
        if (backend.saveFailure === "thrown") throw new Error("network unavailable");
        if (backend.saveFailure === "returned") return { data: null, error: { message: "write failed" } };
        if (backend.saveFailure === "structured") return { data: { status: "server_error" }, error: null };
        if (args.p_expected_version !== backend.version) {
          return { data: { status: "stale", version: backend.version }, error: null };
        }
        backend.activeProvider = args.p_values.school_setup_email_provider;
        backend.version += 1;
        return { data: { status: "success", version: backend.version }, error: null };
    }),
  },
})) }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/adminPermissions", () => ({ requireSuperAdminAccess }));
vi.mock("@/lib/email/schoolSetupProviders.server", () => ({
  getSchoolSetupProviderConfiguration: vi.fn((provider: string) => ({
    configured: backend.unconfiguredProvider !== provider,
    missing: backend.unconfiguredProvider === provider ? ["TEST_PROVIDER_SECRET"] : [],
  })),
  sendSchoolSetupEmail: vi.fn(),
}));

import { saveEmailDeliverySettings } from "./actions";

function saveForm(provider: string, expectedVersion = backend.version) {
  const form = new FormData();
  form.set("school_setup_email_provider", provider);
  form.set("version", String(expectedVersion));
  return form;
}

describe("Email Delivery settings actions", () => {
  beforeEach(() => {
    backend.activeProvider = "resend";
    backend.version = 4;
    backend.saveFailure = null;
    backend.unconfiguredProvider = null;
    requireSuperAdminAccess.mockClear();
  });

  it("imports the actions module with only callable runtime exports", async () => {
    const actions = await import("./actions");
    expect(Object.keys(actions).sort()).toEqual([
      "saveEmailDeliverySettings",
      "saveGeneralSettings",
      "saveNewSchoolDefaults",
      "sendTestSchoolSetupEmail",
    ]);
    expect(Object.values(actions).every((value) => typeof value === "function")).toBe(true);
  });

  it("persists Resend to Google Workspace and returns the reloaded provider", async () => {
    const form = saveForm("google_workspace");
    form.set("$ACTION_ID_saveEmailDeliverySettings", "framework-metadata");
    const result = await saveEmailDeliverySettings(
      { status: "idle" },
      form
    );

    const reloadedProvider = backend.activeProvider;
    expect(result).toMatchObject({ status: "success", version: 5 });
    expect(reloadedProvider).toBe("google_workspace");
    expect(requireSuperAdminAccess).toHaveBeenCalledOnce();
  });

  it("persists Google Workspace back to Resend", async () => {
    backend.activeProvider = "google_workspace";
    const result = await saveEmailDeliverySettings({ status: "idle" }, saveForm("resend"));

    expect(result).toMatchObject({ status: "success", version: 5 });
    expect(backend.activeProvider).toBe("resend");
  });

  it("rejects unknown setting names while allowing Server Action metadata", async () => {
    const form = saveForm("google_workspace");
    form.set("settingName", "school_setup_email_provider");
    form.set("$ACTION_KEY", "framework-metadata");

    await expect(saveEmailDeliverySettings({ status: "idle" }, form)).resolves.toEqual({
      status: "validation_error",
      message: "Unsupported platform setting.",
    });
    expect(backend.activeProvider).toBe("resend");
  });

  it("blocks a configured enum value when its provider configuration is missing", async () => {
    backend.unconfiguredProvider = "google_workspace";

    const result = await saveEmailDeliverySettings(
      { status: "idle" },
      saveForm("google_workspace")
    );

    expect(result).toMatchObject({ status: "validation_error" });
    expect(result.message).toContain("Google Workspace is not configured");
    expect(backend.activeProvider).toBe("resend");
  });

  it.each(["returned", "thrown"] as const)(
    "returns a handled result when the settings write is %s",
    async (failure) => {
      backend.saveFailure = failure;
      await expect(
        saveEmailDeliverySettings({ status: "idle" }, saveForm("google_workspace"))
      ).resolves.toEqual({
        status: "server_error",
        message: expect.stringMatching(/^Sundial could not save email delivery settings\. Try again\. Support ID: [0-9a-f-]+$/),
      });
      expect(backend.activeProvider).toBe("resend");
    }
  );

  it("handles the production scalar JSONB failure payload", async () => {
    backend.saveFailure = "structured";
    const result = await saveEmailDeliverySettings(
      { status: "idle" },
      saveForm("google_workspace")
    );

    expect(result.status).toBe("server_error");
    expect(result.message).toContain("Support ID:");
    expect(backend.activeProvider).toBe("resend");
  });
});
