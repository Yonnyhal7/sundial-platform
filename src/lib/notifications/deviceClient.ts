"use client";

export type NotificationDeviceIdentity = { installationId: string; token: string };
export type NotificationDeviceIdentityState =
  | { status: "available"; identity: NotificationDeviceIdentity }
  | { status: "missing"; identity: null }
  | { status: "unavailable"; identity: null };

function key(schoolId: string) {
  return `sundial:notifications:${schoolId}:device`;
}

export function getNotificationDeviceIdentityState(
  schoolId: string
): NotificationDeviceIdentityState {
  try {
    const value = localStorage.getItem(key(schoolId));
    if (!value) return { status: "missing", identity: null };
    const identity = JSON.parse(value) as Partial<NotificationDeviceIdentity>;
    return typeof identity.installationId === "string" &&
      typeof identity.token === "string"
      ? {
          status: "available",
          identity: {
            installationId: identity.installationId,
            token: identity.token,
          },
        }
      : { status: "unavailable", identity: null };
  } catch {
    return { status: "unavailable", identity: null };
  }
}

export function getNotificationDeviceIdentity(schoolId: string) {
  const state = getNotificationDeviceIdentityState(schoolId);
  return state.status === "available" ? state.identity : null;
}

export function createNotificationDeviceIdentity(schoolId: string) {
  const identity = {
    installationId: crypto.randomUUID(),
    token: [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  };
  localStorage.setItem(key(schoolId), JSON.stringify(identity));
  return identity;
}

export function notificationDeviceHeaders(identity: NotificationDeviceIdentity) {
  return { "x-sundial-installation": identity.installationId, "x-sundial-device-token": identity.token };
}
