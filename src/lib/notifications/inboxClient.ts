"use client";

import type { NotificationAudience } from "@/lib/notifications";
import {
  getNotificationDeviceIdentity,
  notificationDeviceHeaders,
} from "@/lib/notifications/deviceClient";

export type DeviceInboxNotification = {
  id: string;
  read_at: string | null;
  opened_at: string | null;
  delivered_at: string | null;
  created_at: string;
  notification_campaigns: {
    title: string;
    body: string;
    category: string;
    destination_url: string | null;
    related_entity_type: string | null;
  };
};

export type DeviceInboxPayload = {
  audience: NotificationAudience;
  notifications: DeviceInboxNotification[];
  unreadCount: number;
};

export const NOTIFICATION_INBOX_CHANGED_EVENT = "sundial:notification-inbox-changed";

function cacheKey(schoolId: string, installationId: string) {
  return `sundial:notifications:${schoolId}:${installationId}:inbox:v1`;
}

export function readCachedInbox(schoolId: string): DeviceInboxPayload | null {
  const identity = getNotificationDeviceIdentity(schoolId);
  if (!identity) return null;
  try {
    return JSON.parse(localStorage.getItem(cacheKey(schoolId, identity.installationId)) || "null");
  } catch {
    return null;
  }
}

export function writeCachedInbox(schoolId: string, payload: DeviceInboxPayload) {
  const identity = getNotificationDeviceIdentity(schoolId);
  if (!identity) return;
  localStorage.setItem(cacheKey(schoolId, identity.installationId), JSON.stringify(payload));
}

export function updateCachedInbox(
  schoolId: string,
  update: (payload: DeviceInboxPayload) => DeviceInboxPayload
) {
  const current = readCachedInbox(schoolId);
  if (!current) return;
  const next = update(current);
  writeCachedInbox(schoolId, next);
  announceInboxChange(next.unreadCount);
}

export function announceInboxChange(unreadCount: number) {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_INBOX_CHANGED_EVENT, {
    detail: { unreadCount },
  }));
}

export async function fetchDeviceInbox(schoolId: string, school: string) {
  const identity = getNotificationDeviceIdentity(schoolId);
  if (!identity) throw new Error("Notifications are not set up on this device.");
  const response = await fetch(`/api/schools/${encodeURIComponent(school)}/notifications`, {
    headers: notificationDeviceHeaders(identity),
  });
  if (!response.ok) throw new Error("Unable to refresh notifications.");
  const payload = await response.json() as DeviceInboxPayload;
  writeCachedInbox(schoolId, payload);
  announceInboxChange(payload.unreadCount);
  return payload;
}

export async function mutateDeviceInbox(
  schoolId: string,
  school: string,
  body: Record<string, unknown>
) {
  const identity = getNotificationDeviceIdentity(schoolId);
  if (!identity) throw new Error("Notifications are not set up on this device.");
  const response = await fetch(`/api/schools/${encodeURIComponent(school)}/notifications`, {
    method: "POST",
    headers: {
      ...notificationDeviceHeaders(identity),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Unable to update notifications.");
  }
}
