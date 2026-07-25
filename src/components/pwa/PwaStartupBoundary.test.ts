import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAudience } from "./PwaStartupBoundary";

const schoolId = "school-1";
const deviceKey = `sundial:notifications:${schoolId}:device`;
const audienceKey =
  `sundial:notifications:${schoolId}:confirmed-audience:v1`;

function installBrowser({
  online = true,
  identity,
  audience,
}: {
  online?: boolean;
  identity?: unknown;
  audience?: string;
} = {}) {
  const values = new Map<string, string>();
  if (identity !== undefined) {
    values.set(deviceKey, JSON.stringify(identity));
  }
  if (audience !== undefined) values.set(audienceKey, audience);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("navigator", { onLine: online });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PWA audience resolution", () => {
  it("requires onboarding when no audience or device record exists", async () => {
    installBrowser();
    await expect(resolveAudience(schoolId, "deloro", true)).resolves.toEqual({
      status: "unassigned",
      audience: null,
    });
  });

  it("requires onboarding for corrupt identity even with stale cached audience", async () => {
    const values = installBrowser({
      identity: { installationId: "only-one-field" },
      audience: "student",
    });
    await expect(resolveAudience(schoolId, "deloro", true)).resolves.toEqual({
      status: "unassigned",
      audience: null,
    });
    expect(values.has(audienceKey)).toBe(false);
  });

  it("does not infer audience from permission, identity, or cached app data", async () => {
    installBrowser({
      identity: { installationId: "installation", token: "token" },
    });
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 }))
    );

    await expect(resolveAudience(schoolId, "deloro", true)).resolves.toEqual({
      status: "unassigned",
      audience: null,
    });
  });

  it("clears a persisted reinstall audience when the server no longer assigns it", async () => {
    const values = installBrowser({
      identity: { installationId: "installation", token: "token" },
      audience: "student",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 }))
    );

    await expect(resolveAudience(schoolId, "deloro", true)).resolves.toEqual({
      status: "unassigned",
      audience: null,
    });
    expect(values.has(audienceKey)).toBe(false);
  });

  it("uses a server-confirmed audience and records it for offline startup", async () => {
    const values = installBrowser({
      identity: { installationId: "installation", token: "token" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ audience: "staff" }), { status: 200 })
      )
    );

    await expect(resolveAudience(schoolId, "deloro", true)).resolves.toEqual({
      status: "assigned",
      audience: "staff",
    });
    expect(values.get(audienceKey)).toBe("staff");
  });

  it("uses only a confirmed audience for offline assigned startup", async () => {
    installBrowser({
      online: false,
      identity: { installationId: "installation", token: "token" },
      audience: "parent",
    });
    await expect(resolveAudience(schoolId, "deloro", true)).resolves.toEqual({
      status: "assigned",
      audience: "parent",
    });
  });

  it("shows offline unknown when identity exists without confirmed audience", async () => {
    installBrowser({
      online: false,
      identity: { installationId: "installation", token: "token" },
    });
    await expect(resolveAudience(schoolId, "deloro", true)).resolves.toEqual({
      status: "offline_unknown",
      audience: null,
    });
  });

  it("does not convert transport uncertainty into assignment", async () => {
    installBrowser({
      identity: { installationId: "installation", token: "token" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 }))
    );
    await expect(resolveAudience(schoolId, "deloro", true)).resolves.toEqual({
      status: "transport_error",
      audience: null,
    });
  });
});
