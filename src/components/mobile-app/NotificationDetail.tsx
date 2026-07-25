"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getNotificationCategoryLabel } from "@/lib/notifications";
import {
  fetchDeviceInbox,
  mutateDeviceInbox,
  queuePendingRead,
  readCachedInbox,
  updateCachedInbox,
  type DeviceInboxNotification,
} from "@/lib/notifications/inboxClient";

type Props = {
  deliveryId: string;
  school: string;
  schoolId: string;
  timeZone: string;
  onBack?: () => void;
  onDeleted?: () => void;
};

function destinationLabel(type: string | null) {
  if (type === "announcement") return "View announcement";
  if (type === "event") return "View event";
  if (type === "calendar_change") return "Open calendar";
  return "Open destination";
}

export default function NotificationDetail({ deliveryId, school, schoolId, timeZone, onBack, onDeleted }: Props) {
  const router = useRouter();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [item, setItem] = useState<DeviceInboxNotification | null>(() =>
    readCachedInbox(schoolId)?.notifications.find((row) => row.id === deliveryId) || null
  );
  const [loading, setLoading] = useState(!item);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    fetchDeviceInbox(schoolId, school).then((payload) => {
      if (!active) return;
      setItem(payload.notifications.find((row) => row.id === deliveryId) || null);
      setLoading(false);
    }).catch((reason: Error) => {
      if (!active) return;
      setLoading(false);
      if (!readCachedInbox(schoolId)?.notifications.some((row) => row.id === deliveryId)) setError(reason.message);
      else setStatus("Showing the saved notification while offline.");
    });
    return () => { active = false; };
  }, [deliveryId, school, schoolId]);

  useEffect(() => {
    if (!item || item.read_at) return;
    const readAt = new Date().toISOString();
    updateCachedInbox(schoolId, (payload) => ({
      ...payload,
      unreadCount: Math.max(0, payload.unreadCount - 1),
      notifications: payload.notifications.map((row) => row.id === deliveryId ? { ...row, read_at: readAt } : row),
    }));
    const statusUpdate = window.setTimeout(() => {
      setItem((current) => current ? { ...current, read_at: readAt } : current);
      setStatus("Notification marked as read.");
    }, 0);
    mutateDeviceInbox(schoolId, school, { action: "mark_read", deliveryId }).catch(() => {
      queuePendingRead(schoolId, deliveryId);
      setStatus("Marked as read on this device. The server will reconcile when you refresh online.");
    });
    return () => window.clearTimeout(statusUpdate);
  }, [deliveryId, item, school, schoolId]);

  useEffect(() => {
    if (!confirmDelete) return;
    cancelButtonRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConfirmDelete(false);
        deleteButtonRef.current?.focus();
      }
      if (event.key === "Tab") {
        const buttons = [cancelButtonRef.current, document.getElementById("confirm-delete-notification")].filter(Boolean) as HTMLElement[];
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : (index + 1) % buttons.length;
        event.preventDefault();
        buttons[next]?.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [confirmDelete]);

  async function deleteNotification() {
    setError("");
    try {
      await mutateDeviceInbox(schoolId, school, { action: "delete", deliveryId });
      updateCachedInbox(schoolId, (payload) => {
        const deleted = payload.notifications.find((row) => row.id === deliveryId);
        return {
          ...payload,
          unreadCount: deleted && !deleted.read_at ? Math.max(0, payload.unreadCount - 1) : payload.unreadCount,
          notifications: payload.notifications.filter((row) => row.id !== deliveryId),
        };
      });
      if (onDeleted) onDeleted();
      else router.replace(`/${school}/app/notifications?deleted=1`);
    } catch (reason) {
      setConfirmDelete(false);
      deleteButtonRef.current?.focus();
      setError(reason instanceof Error ? reason.message : "Unable to delete this notification. Try again when online.");
    }
  }

  if (loading) return <p role="status" className="py-12 text-center font-semibold">Loading notification…</p>;
  if (!item) return (
    <main>
      {onBack ? <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center rounded-2xl px-3 font-black">← Back to Notifications</button> : <Link href={`/${school}/app/notifications`} className="inline-flex min-h-11 items-center rounded-2xl px-3 font-black">← Back to Notifications</Link>}
      <h1 className="mt-6 text-2xl font-black">Notification unavailable</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error || "It may have been deleted from this device."}</p>
    </main>
  );

  const campaign = item.notification_campaigns;
  const received = new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(item.delivered_at || item.created_at));

  return (
    <main>
      {onBack ? <button type="button" onClick={onBack} aria-label="Back to Notifications" className="inline-flex min-h-11 items-center rounded-2xl px-3 font-black focus:ring-2 focus:ring-[var(--school-primary)]">← Back to Notifications</button> : <Link href={`/${school}/app/notifications`} aria-label="Back to Notifications" className="inline-flex min-h-11 items-center rounded-2xl px-3 font-black focus:ring-2 focus:ring-[var(--school-primary)]">← Back to Notifications</Link>}
      <article className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 dark:border-[#3a3a3a] dark:bg-[#242424]">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{getNotificationCategoryLabel(campaign.category)}</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">{campaign.title}</h1>
        <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Received {received}</p>
        {campaign.related_entity_type && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Source: {getNotificationCategoryLabel(campaign.related_entity_type)}</p>}
        <div className="mt-6 whitespace-pre-wrap text-base leading-7 text-slate-700 dark:text-slate-200">{campaign.body}</div>
        {campaign.destination_url && <Link href={campaign.destination_url} className="mt-7 inline-flex min-h-11 items-center rounded-2xl bg-[var(--school-primary)] px-5 font-black text-[var(--school-primary-text)]">{destinationLabel(campaign.related_entity_type)}</Link>}
      </article>
      <button ref={deleteButtonRef} type="button" onClick={() => setConfirmDelete(true)} className="mt-5 min-h-11 rounded-2xl border border-red-300 px-5 font-black text-red-700 dark:border-red-800 dark:text-red-300">Delete notification</button>
      <div aria-live="polite" role="status" className="mt-3 min-h-5 text-sm font-semibold text-slate-600 dark:text-slate-300">{status}</div>
      {error && <p role="alert" className="mt-2 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-5" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-notification-title" aria-describedby="delete-notification-body" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#242424]">
            <h2 id="delete-notification-title" className="text-xl font-black">Delete notification?</h2>
            <p id="delete-notification-body" className="mt-2 text-sm text-slate-600 dark:text-slate-300">This removes the notification from this device only.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button ref={cancelButtonRef} type="button" onClick={() => { setConfirmDelete(false); deleteButtonRef.current?.focus(); }} className="min-h-11 rounded-2xl border border-slate-300 px-4 font-bold dark:border-slate-600">Cancel</button>
              <button id="confirm-delete-notification" type="button" onClick={deleteNotification} className="min-h-11 rounded-2xl bg-red-600 px-4 font-bold text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
