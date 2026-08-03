import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  activeProvider: "resend",
  version: 4,
  saveFailure: null as "returned" | "thrown" | null,
}));

const { requireSuperAdminAccess } = vi.hoisted(() => ({ requireSuperAdminAccess: vi.fn(async () => ({
  profile: { id: "00000000-0000-4000-8000-000000000001" },
  supabase: {
    rpc: vi.fn((_name: string, args: { p_expected_version: number; p_values: { school_setup_email_provider: string } }) => ({
      single: async () => {
        if (backend.saveFailure === "thrown") throw new Error("network unavailable");
        if (backend.saveFailure === "returned") return { data: null, error: { message: "write failed" } };
        if (args.p_expected_version !== backend.version) {
          return { data: { status: "stale", version: backend.version }, error: null };
        }
        backend.activeProvider = args.p_values.school_setup_email_provider;
        backend.version += 1;
        return { data: { status: "success", version: backend.version }, error: null };
      },
    })),
  },
})) }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/adminPermissions", () => ({ requireSuperAdminAccess }));
vi.mock("@/lib/email/schoolSetupProviders.server", () => ({
  getSchoolSetupProviderConfiguration: vi.fn(() => ({ configured: true, missing: [] })),
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
    const result = await saveEmailDeliverySettings(
      { status: "idle" },
      saveForm("google_workspace")
    );

    const reloadedProvider = backend.activeProvider;
    expect(result).toMatchObject({ status: "success", version: 5 });
    expect(reloadedProvider).toBe("google_workspace");
    expect(requireSuperAdminAccess).toHaveBeenCalledOnce();
  });

  it.each(["returned", "thrown"] as const)(
    "returns a handled result when the settings write is %s",
    async (failure) => {
      backend.saveFailure = failure;
      await expect(
        saveEmailDeliverySettings({ status: "idle" }, saveForm("google_workspace"))
      ).resolves.toEqual({
        status: "server_error",
        message: "Sundial could not save email delivery settings. Try again.",
      });
      expect(backend.activeProvider).toBe("resend");
    }
  );
});
