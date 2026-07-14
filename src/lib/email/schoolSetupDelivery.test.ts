import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./config.server", () => ({
  getSchoolEmailConfig: () => ({
    mode: "live",
    apiKey: "re_secret_that_must_not_escape",
    from: "Sundial <setup@sundialk12.com>",
    replyTo: "support@sundialk12.com",
    adminUrl: "https://admin.sundialk12.com",
    overrideTo: null,
  }),
}));

import { deliverSchoolSetupInvitation, type SchoolSetupEmailTransport } from "./schoolSetupDelivery.server";

const rawToken = "A".repeat(43);
const claim = {
  status: "claimed",
  invite_id: "11111111-1111-4111-8111-111111111111",
  school_id: "22222222-2222-4222-8222-222222222222",
  school_name: "Del Oro",
  school_subdomain: "del-oro",
  email: "admin@deloro.edu",
  expires_at: "2026-07-20T20:00:00.000Z",
  attempt_count: 2,
};

function rpcClient(firstResult: unknown) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    client: {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return calls.length === 1
          ? { data: firstResult, error: null }
          : { data: { status: "completed" }, error: null };
      },
    },
    calls,
  };
}

const baseInput = {
  inviteId: claim.invite_id,
  schoolId: claim.school_id,
  rawToken,
  tokenHash: "b".repeat(64),
  expiresAt: new Date(claim.expires_at),
  rotateToken: true,
};

describe("school setup invitation delivery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends through Resend abstraction and records success with idempotency", async () => {
    const rpc = rpcClient(claim);
    const transport: SchoolSetupEmailTransport = {
      send: vi.fn(async (input) => {
        expect(input.to).toBe("admin@deloro.edu");
        expect(input.idempotencyKey).toBe(`school-setup-${claim.invite_id}-2`);
        expect(input.html).toContain("Del Oro");
        expect(input.html).toContain("/invitations#token=");
        return { id: "resend-message-id", errorName: null };
      }),
    };
    const result = await deliverSchoolSetupInvitation({
      ...baseInput,
      supabase: rpc.client as never,
      transport,
    });
    expect(result.status).toBe("sent");
    expect(rpc.calls[0].args.p_rotate_token).toBe(true);
    expect(rpc.calls[1].args).toMatchObject({
      p_success: true,
      p_provider_message_id: "resend-message-id",
      p_attempt_count: 2,
    });
  });

  it("retains the invitation and records a sanitized provider failure", async () => {
    const rpc = rpcClient(claim);
    const transport: SchoolSetupEmailTransport = {
      send: vi.fn(async () => ({ id: null, errorName: "invalid_api_key" })),
    };
    const result = await deliverSchoolSetupInvitation({
      ...baseInput,
      supabase: rpc.client as never,
      transport,
    });
    expect(result.status).toBe("failed");
    expect(rpc.calls[1].args).toMatchObject({
      p_success: false,
      p_failure_reason: "Email provider rejected the request (invalid_api_key).",
    });
  });

  it.each(["already_sending", "permission_error", "school_unavailable", "not_found"])(
    "does not send when the database claim returns %s",
    async (status) => {
      const rpc = rpcClient({ status });
      const transport = { send: vi.fn() } as unknown as SchoolSetupEmailTransport;
      const result = await deliverSchoolSetupInvitation({
        ...baseInput,
        supabase: rpc.client as never,
        transport,
      });
      expect(result.status).toBe(status === "already_sending" ? "already_sending" : "rejected");
      expect(transport.send).not.toHaveBeenCalled();
      expect(rpc.calls).toHaveLength(1);
    }
  );

  it("never exposes provider secrets or raw tokens in returned or stored errors", async () => {
    const rpc = rpcClient(claim);
    const transport: SchoolSetupEmailTransport = {
      send: vi.fn(async () => {
        throw new Error(`re_secret_that_must_not_escape ${rawToken}`);
      }),
    };
    const result = await deliverSchoolSetupInvitation({
      ...baseInput,
      supabase: rpc.client as never,
      transport,
    });
    const observable = JSON.stringify({ result, completion: rpc.calls[1] });
    expect(observable).not.toContain("re_secret_that_must_not_escape");
    expect(observable).not.toContain(rawToken);
  });
});
