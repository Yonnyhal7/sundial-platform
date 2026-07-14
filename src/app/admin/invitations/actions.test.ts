import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  redirect: vi.fn(),
  setupPath: vi.fn(),
  exchange: vi.fn(),
  accept: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/adminPermissions", () => ({
  getSchoolSetupPath: mocks.setupPath,
}));
vi.mock("@/lib/invitations/acceptance.server", () => ({
  exchangeSchoolSetupInvitationToken: mocks.exchange,
  acceptSchoolSetupInvitation: mocks.accept,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithPassword: mocks.signIn },
  }),
}));

import { acceptInvitationAction, exchangeInvitationTokenAction } from "./actions";

function validForm(password = "a-secure-password") {
  const form = new FormData();
  form.set("firstName", "Avery");
  form.set("lastName", "Admin");
  form.set("password", password);
  form.set("confirmPassword", password);
  return form;
}

describe("school invitation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieGet.mockReturnValue({ value: "S".repeat(43) });
    mocks.setupPath.mockResolvedValue("/del-oro/dashboard/setup/welcome");
    mocks.signIn.mockResolvedValue({ error: null });
  });

  it("exchanges the fragment token for an HttpOnly acceptance cookie without returning it", async () => {
    mocks.exchange.mockResolvedValue({
      view: { status: "valid", schoolName: "Del Oro", email: "admin@example.com" },
      sessionToken: "S".repeat(43),
      sessionExpiresAt: new Date("2026-07-13T22:00:00.000Z"),
    });
    const view = await exchangeInvitationTokenAction("T".repeat(43));
    expect(mocks.exchange).toHaveBeenCalledWith("T".repeat(43));
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "sundial_school_setup_acceptance",
      "S".repeat(43),
      expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/" })
    );
    expect(view).toEqual({
      status: "valid",
      schoolName: "Del Oro",
      email: "admin@example.com",
    });
  });

  it("requires password confirmation before touching the invitation", async () => {
    const form = validForm();
    form.set("confirmPassword", "different-password");
    const state = await acceptInvitationAction({}, form);
    expect(state.error).toMatch(/do not match/);
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("creates the account, establishes a session, clears acceptance state, and enters setup", async () => {
    mocks.accept.mockResolvedValue({
      ok: true,
      email: "admin@example.com",
      schoolSubdomain: "del-oro",
    });
    await acceptInvitationAction({}, validForm());
    expect(mocks.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionToken: "S".repeat(43),
        password: "a-secure-password",
      })
    );
    expect(mocks.signIn).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "a-secure-password",
    });
    expect(mocks.cookieDelete).toHaveBeenCalledWith("sundial_school_setup_acceptance");
    expect(mocks.setupPath).toHaveBeenCalledWith("del-oro");
    expect(mocks.redirect).toHaveBeenCalledWith("/del-oro/dashboard/setup/welcome");
  });

  it("does not attach an invitation when the email already has an Auth account", async () => {
    mocks.accept.mockResolvedValue({ ok: false, reason: "account_exists" });
    const state = await acceptInvitationAction({}, validForm());
    expect(state.error).toContain("not accepted or attached");
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a safe recovery message if automatic sign-in unexpectedly fails", async () => {
    mocks.accept.mockResolvedValue({
      ok: true,
      email: "admin@example.com",
      schoolSubdomain: "del-oro",
    });
    mocks.signIn.mockResolvedValue({ error: { message: "provider detail" } });
    const state = await acceptInvitationAction({}, validForm());
    expect(state.error).toContain("automatic sign-in failed");
    expect(state.error).not.toContain("provider detail");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
