import {
  createNotificationDeviceIdentity,
  getNotificationDeviceIdentity,
  notificationDeviceHeaders,
  setConfirmedNotificationAudience,
  type NotificationDeviceIdentity,
} from "@/lib/notifications/deviceClient";
import type { NotificationAudience } from "@/lib/notifications";

type OnboardingContext = {
  schoolId: string;
  school: string;
  audience: NotificationAudience;
};

function endpoint(school: string) {
  return `/api/schools/${encodeURIComponent(school)}/notifications`;
}

function deviceHeaders(identity: NotificationDeviceIdentity) {
  return {
    ...notificationDeviceHeaders(identity),
    "content-type": "application/json",
  };
}

export async function saveNotificationAudience({
  schoolId,
  school,
  audience,
}: OnboardingContext) {
  const identity =
    getNotificationDeviceIdentity(schoolId) ||
    createNotificationDeviceIdentity(schoolId);
  const response = await fetch(endpoint(school), {
    method: "POST",
    headers: deviceHeaders(identity),
    body: JSON.stringify({
      action: "register",
      audience,
      platform: navigator.platform || "unknown",
      browser: navigator.userAgent.slice(0, 40),
      pwaInstalled: window.matchMedia("(display-mode: standalone)").matches,
      notificationsSupported:
        "serviceWorker" in navigator && "PushManager" in window,
      permissionStatus:
        "Notification" in window ? Notification.permission : "unsupported",
    }),
  });

  if (!response.ok) {
    throw new Error("audience_transport_failed");
  }

  setConfirmedNotificationAudience(schoolId, audience);
  return identity;
}

export async function requestNotificationPermissionAndSubscribe({
  school,
  identity,
}: {
  school: string;
  identity: NotificationDeviceIdentity;
}) {
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { permission: "unsupported" as const };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { permission };
  }

  const configResponse = await fetch("/api/notifications/config");
  if (!configResponse.ok) throw new Error("push_config_failed");
  const config = await configResponse.json();
  const key = String(config.publicKey || "");
  const bytes = Uint8Array.from(
    atob(
      key
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(key.length / 4) * 4, "=")
    ),
    (character) => character.charCodeAt(0)
  );
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes,
  });
  const saved = await fetch(endpoint(school), {
    method: "POST",
    headers: deviceHeaders(identity),
    body: JSON.stringify({
      action: "subscribe",
      subscription: subscription.toJSON(),
    }),
  });
  if (!saved.ok) throw new Error("push_subscription_failed");

  return { permission };
}
