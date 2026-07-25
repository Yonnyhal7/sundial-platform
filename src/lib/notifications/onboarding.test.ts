import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestNotificationPermissionAndSubscribe,
  saveNotificationAudience,
} from "./onboarding";

function installBrowser(permission: NotificationPermission = "default") {
  const values = new Map<string, string>();
  const order: string[] = [];
  const requestPermission = vi.fn(async () => {
    order.push("permission");
    return permission;
  });
  const subscribe = vi.fn(async () => ({
    toJSON: () => ({ endpoint: "https://push.example/device" }),
  }));
  const notification = { permission: "default", requestPermission };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("navigator", {
    platform: "iPhone",
    userAgent: "Mobile Safari",
    serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe } }) },
  });
  vi.stubGlobal("window", {
    Notification: notification,
    PushManager: function PushManager() {},
    matchMedia: () => ({ matches: true }),
  });
  return { order, requestPermission, subscribe };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notification audience onboarding", () => {
  it("persists audience before requesting push permission", async () => {
    const browser = installBrowser("granted");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      browser.order.push(url.includes("/config") ? "config" : "device");
      if (url.includes("/config")) {
        return new Response(JSON.stringify({ publicKey: "AQ" }), {
          status: 200,
        });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const identity = await saveNotificationAudience({
      schoolId: "school-1",
      school: "deloro",
      audience: "student",
    });
    await requestNotificationPermissionAndSubscribe({
      school: "deloro",
      identity,
    });

    expect(browser.order[0]).toBe("device");
    expect(browser.order.indexOf("permission")).toBeGreaterThan(0);
    expect(browser.subscribe).toHaveBeenCalledTimes(1);
  });

  it("preserves the saved audience when permission is denied", async () => {
    const browser = installBrowser("denied");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const identity = await saveNotificationAudience({
      schoolId: "school-1",
      school: "deloro",
      audience: "parent",
    });
    const result = await requestNotificationPermissionAndSubscribe({
      school: "deloro",
      identity,
    });

    expect(result.permission).toBe("denied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(browser.subscribe).not.toHaveBeenCalled();
  });

  it("reports transport failure without requesting permission or choosing silently", async () => {
    const browser = installBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 }))
    );

    await expect(
      saveNotificationAudience({
        schoolId: "school-1",
        school: "deloro",
        audience: "staff",
      })
    ).rejects.toThrow("audience_transport_failed");
    expect(browser.requestPermission).not.toHaveBeenCalled();
  });
});
