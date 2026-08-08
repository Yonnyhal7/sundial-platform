"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { getOptimisticFeaturedEventId, reconcileFeaturedEventId } from "@/lib/featuredEventOptimism";

export type AdminEventListItem = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  event_date: string | null;
  start_time: string | null;
  is_active: boolean;
  is_featured: boolean;
};

export type FeaturedEventActionResult = {
  status: "success" | "error";
  message: string;
};

export default function AdminEventsList({
  school,
  events,
  setFeaturedAction,
  deleteAction,
}: {
  school: string;
  events: AdminEventListItem[];
  setFeaturedAction: (eventId: string, featured: boolean) => Promise<FeaturedEventActionResult>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const initialFeaturedId = events.find((event) => event.is_featured)?.id || null;
  const [confirmedFeaturedId, setConfirmedFeaturedId] = useState(initialFeaturedId);
  const [optimisticFeaturedId, setOptimisticFeaturedId] = useOptimistic(confirmedFeaturedId);
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const mutationPending = pendingEventId !== null;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.kind === "success" ? 2500 : 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function updateFeatured(eventId: string, featured: boolean) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const previousFeaturedId = confirmedFeaturedId;
    const nextFeaturedId = getOptimisticFeaturedEventId(previousFeaturedId, eventId, featured);
    setPendingEventId(eventId);

    startTransition(async () => {
      setOptimisticFeaturedId(nextFeaturedId);
      try {
        const result = await setFeaturedAction(eventId, featured);
        const succeeded = result.status === "success";
        setConfirmedFeaturedId(
          reconcileFeaturedEventId({ previousFeaturedId, optimisticFeaturedId: nextFeaturedId, succeeded })
        );
        setToast({ kind: succeeded ? "success" : "error", message: result.message });
      } catch {
        setConfirmedFeaturedId(previousFeaturedId);
        setToast({ kind: "error", message: "Featured event could not be updated. Please try again." });
      } finally {
        setPendingEventId(null);
        pendingRef.current = false;
      }
    });
  }

  if (events.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"><h3 className="text-lg font-semibold">No events yet</h3><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Once events are created, they will appear here.</p></div>;
  }

  return <>
    <section className="space-y-4">
      {events.map((event) => {
        const featured = optimisticFeaturedId === event.id;
        const saving = pendingEventId === event.id;
        return <article key={event.id} className={`rounded-2xl border bg-white p-5 shadow-sm transition dark:bg-[#242424] ${saving ? "border-amber-400/70 opacity-80 dark:border-amber-600/70" : "border-slate-200 dark:border-[#3a3a3a]"}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-semibold">{event.title}</h3>
              {event.is_active && <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-500/30 dark:text-green-300">Active</span>}
              <button type="button" onClick={() => updateFeatured(event.id, !featured)} disabled={mutationPending || (!event.is_active && !featured)} aria-label={featured ? `Remove ${event.title} as the featured event` : `Make ${event.title} the featured event`} title={!event.is_active ? "Inactive events cannot be featured" : featured ? "Remove Featured" : "Make Featured"} className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ring-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${featured ? "bg-amber-500/15 text-amber-800 ring-amber-500/35 hover:bg-amber-500/25 dark:text-amber-300" : "bg-slate-100 text-slate-600 ring-slate-300 hover:bg-amber-500/10 hover:text-amber-800 hover:ring-amber-500/35 dark:bg-black/30 dark:text-slate-300 dark:ring-slate-600 dark:hover:text-amber-300"}`}>
                {saving ? <><span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />Saving…</> : <><span aria-hidden="true">{featured ? "★" : "☆"}</span> {featured ? "Featured" : "Make Featured"}</>}
              </button>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{event.description}</p>
            {event.location && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Location: {event.location}</p>}</div>
            <div className="text-left text-sm text-slate-500 dark:text-slate-400 sm:text-right"><p>Starts</p><p className="font-medium text-slate-900 dark:text-slate-200">{event.event_date ? new Date(`${event.event_date}T00:00:00`).toLocaleDateString() : "Not set"}</p><p className="text-slate-600 dark:text-slate-300">{event.start_time ? new Date(`2000-01-01T${event.start_time}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</p></div>
          </div>
          <div className="mt-5 flex gap-3 border-t border-slate-200 pt-4 dark:border-[#3a3a3a]"><Link href={`/${school}/admin/events/${event.id}/edit`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10">Edit</Link><form action={deleteAction}><input type="hidden" name="event_id" value={event.id} /><button type="submit" disabled={mutationPending} className="cursor-pointer rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40">Delete</button></form></div>
        </article>;
      })}
    </section>
    <p className="sr-only" role="status" aria-live="polite">{mutationPending ? "Updating featured event" : ""}</p>
    {toast && createPortal(<div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex justify-center px-4"><p role={toast.kind === "error" ? "alert" : "status"} aria-live={toast.kind === "error" ? "assertive" : "polite"} className={`notification-toast rounded-xl px-4 py-3 text-sm font-bold text-white shadow-xl ${toast.kind === "success" ? "bg-emerald-700" : "bg-red-700"}`}>{toast.message}</p></div>, document.body)}
  </>;
}
