import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearConfirmedNotificationAudience,
  getConfirmedNotificationAudience,
  getNotificationDeviceIdentityState,
  setConfirmedNotificationAudience,
} from "./deviceClient";

function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notification device state", () => {
  it("does not infer an audience from an existing device identity", () => {
    installStorage({
      "sundial:notifications:school-1:device": JSON.stringify({
        installationId: "installation",
        token: "token",
      }),
    });

    expect(getNotificationDeviceIdentityState("school-1").status).toBe(
      "available"
    );
    expect(getConfirmedNotificationAudience("school-1")).toBeNull();
  });

  it("accepts only a separately confirmed valid audience", () => {
    const values = installStorage();
    setConfirmedNotificationAudience("school-1", "parent");
    expect(getConfirmedNotificationAudience("school-1")).toBe("parent");

    values.set(
      "sundial:notifications:school-1:confirmed-audience:v1",
      "unknown"
    );
    expect(getConfirmedNotificationAudience("school-1")).toBeNull();
  });

  it("clears a stale confirmed audience without clearing device identity", () => {
    const values = installStorage({
      "sundial:notifications:school-1:device": JSON.stringify({
        installationId: "installation",
        token: "token",
      }),
      "sundial:notifications:school-1:confirmed-audience:v1": "staff",
    });

    clearConfirmedNotificationAudience("school-1");

    expect(getConfirmedNotificationAudience("school-1")).toBeNull();
    expect(values.has("sundial:notifications:school-1:device")).toBe(true);
  });
});
