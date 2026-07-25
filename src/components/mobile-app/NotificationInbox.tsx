"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  getNotificationCategoryLabel,
  type NotificationAudience,
} from "@/lib/notifications";
import {
  announceInboxChange,
  fetchDeviceInbox,
  mutateDeviceInbox,
  queuePendingRead,
  readCachedInbox,
  writeCachedInbox,
  type DeviceInboxNotification,
  type DeviceInboxPayload,
} from "@/lib/notifications/inboxClient";

type Props = {
  school: string;
  schoolId: string;
  timeZone: string;
  initialAudience: NotificationAudience | null;
};

function receivedLabel(value: string, timeZone: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  returnFocus,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
        returnFocus.current?.focus();
      }
      if (event.key === "Tab") {
        const buttons = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLButtonElement[];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[event.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : (index + 1) % buttons.length]?.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel, returnFocus]);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-5" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-read-title" aria-describedby="delete-read-body" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#242424]">
        <h2 id="delete-read-title" className="text-xl font-black">{title}</h2>
        <p id="delete-read-body" className="mt-2 text-sm text-slate-600 dark:text-slate-300">{body}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className="min-h-11 rounded-2xl border border-slate-300 px-4 font-bold dark:border-slate-600">Cancel</button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className="min-h-11 rounded-2xl bg-red-600 px-4 font-bold text-white">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationInbox({ school, schoolId, timeZone, initialAudience }: Props) {
  const [payload, setPayload] = useState<DeviceInboxPayload | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [confirmDeleteRead, setConfirmDeleteRead] = useState(false);
  const deleteReadButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const cached = readCachedInbox(schoolId);
    const cachedUpdate = cached ? window.setTimeout(() => setPayload(cached), 0) : null;
    fetchDeviceInbox(schoolId, school).then(setPayload).catch((reason: Error) => {
      if (!cached) setError(reason.message);
      else setStatus("Showing saved notifications while offline.");
    });
    return () => {
      if (cachedUpdate !== null) window.clearTimeout(cachedUpdate);
    };
  }, [school, schoolId]);

  const notifications = payload?.notifications || [];
  const hasRead = notifications.some((item) => item.read_at);
  const audience = payload?.audience || initialAudience;
  const audienceLabel = audience ? `${audience[0].toUpperCase()}${audience.slice(1)}` : "Device";

  async function markAllRead() {
    if (!payload || payload.unreadCount === 0) return;
    const now = new Date().toISOString();
    const optimistic = {
      ...payload,
      unreadCount: 0,
      notifications: payload.notifications.map((item) => item.read_at ? item : { ...item, read_at: now }),
    };
    setPayload(optimistic);
    writeCachedInbox(schoolId, optimistic);
    announceInboxChange(0);
    setStatus("All notifications marked as read.");
    try {
      await mutateDeviceInbox(schoolId, school, { action: "mark_read", deliveryId: "all" });
    } catch {
      queuePendingRead(schoolId, "all");
      setStatus("Read changes are saved on this device and will retry when you refresh online.");
    }
  }

  async function deleteRead() {
    setConfirmDeleteRead(false);
    setError("");
    try {
      await mutateDeviceInbox(schoolId, school, { action: "delete_read" });
      setPayload((current) => {
        if (!current) return current;
        const next = { ...current, notifications: current.notifications.filter((item) => !item.read_at) };
        writeCachedInbox(schoolId, next);
        return next;
      });
      setStatus("Read notifications deleted from this device.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete read notifications. Try again when online.");
    }
  }

  return (
    <main>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{audienceLabel} device</p>
        </div>
        <button type="button" disabled={!payload?.unreadCount} onClick={markAllRead} className="min-h-11 rounded-2xl bg-[var(--school-primary)] px-4 text-sm font-black text-[var(--school-primary-text)] disabled:cursor-not-allowed disabled:opacity-45">
          Mark all as read
        </button>
      </div>
      <div aria-live="polite" role="status" className="mt-3 min-h-5 text-sm font-semibold text-slate-600 dark:text-slate-300">{status}</div>
      {error && <p role="alert" className="mt-2 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {hasRead && <button ref={deleteReadButtonRef} type="button" onClick={() => setConfirmDeleteRead(true)} className="mt-3 min-h-11 rounded-2xl border border-slate-300 px-4 text-sm font-black dark:border-slate-600">Delete all read</button>}
      <div className="mt-5 space-y-3">
        {notifications.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center dark:border-[#3a3a3a] dark:bg-[#242424]">
            <p className="font-black">You&apos;re all caught up.</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">New notifications for this device will appear here.</p>
          </div>
        ) : notifications.map((item) => <NotificationCard key={item.id} item={item} school={school} timeZone={timeZone} />)}
      </div>
      {confirmDeleteRead && <ConfirmDialog title="Delete all read notifications?" body="This removes read notifications from this device only. Unread notifications will remain." confirmLabel="Delete" onCancel={() => { setConfirmDeleteRead(false); deleteReadButtonRef.current?.focus(); }} onConfirm={deleteRead} returnFocus={deleteReadButtonRef} />}
    </main>
  );
}

function NotificationCard({ item, school, timeZone }: { item: DeviceInboxNotification; school: string; timeZone: string }) {
  const unread = !item.read_at;
  const campaign = item.notification_campaigns;
  return (
    <Link href={`/${school}/app/notifications/${item.id}`} aria-label={`${unread ? "Unread notification" : "Read notification"}: ${campaign.title}`} className={`block min-h-11 rounded-3xl border p-4 transition motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] ${unread ? "border-[var(--school-primary)] bg-[color-mix(in_srgb,var(--school-primary)_7%,white)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]" : "border-slate-200 bg-white dark:border-[#3a3a3a] dark:bg-[#242424]"}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${unread ? "bg-[var(--school-primary)]" : "border border-slate-400"}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className={`text-base ${unread ? "font-black" : "font-semibold"}`}>{campaign.title}</h2>
            {campaign.destination_url && <span className="shrink-0 text-xs font-bold text-slate-500" aria-label="Has a destination">Open ›</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{campaign.body}</p>
          <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">{getNotificationCategoryLabel(campaign.category)} · {receivedLabel(item.delivered_at || item.created_at, timeZone)}</p>
          <span className="sr-only">{unread ? "Unread" : "Read"}</span>
        </div>
      </div>
    </Link>
  );
}
