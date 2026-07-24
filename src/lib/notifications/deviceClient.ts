"use client";

export type NotificationDeviceIdentity = { installationId: string; token: string };

function key(schoolId: string) {
  return `sundial:notifications:${schoolId}:device`;
}

export function getNotificationDeviceIdentity(schoolId: string) {
  try {
    const value = localStorage.getItem(key(schoolId));
    return value ? JSON.parse(value) as NotificationDeviceIdentity : null;
  } catch {
    return null;
  }
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
