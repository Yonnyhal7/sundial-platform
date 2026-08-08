"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  QUICK_LINK_GUIDANCE_THRESHOLD,
  getOptimisticQuickLinkIds,
  reconcileQuickLinkIds,
} from "@/lib/resourceQuickLinks";

export type AdminResourceListItem = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  is_quick_link: boolean;
};

export type QuickLinkActionResult = {
  status: "success" | "error";
  message: string;
};

function StarIcon({ selected }: { selected: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={selected ? "currentColor" : "none"} aria-hidden="true">
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export default function AdminResourcesList({
  school,
  resources,
  setQuickLinkAction,
  deleteAction,
}: {
  school: string;
  resources: AdminResourceListItem[];
  setQuickLinkAction: (resourceId: string, selected: boolean) => Promise<QuickLinkActionResult>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const initialIds = resources
    .filter((resource) => resource.is_active && resource.is_quick_link)
    .map((resource) => resource.id);
  const [confirmedIds, setConfirmedIds] = useState(initialIds);
  const [optimisticIds, setOptimisticIds] = useOptimistic(confirmedIds);
  const [pendingResourceId, setPendingResourceId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const mutationPending = pendingResourceId !== null;
  const selectedCount = optimisticIds.length;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.kind === "success" ? 2500 : 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function updateQuickLink(resourceId: string, selected: boolean) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const previousIds = confirmedIds;
    const nextIds = getOptimisticQuickLinkIds(previousIds, resourceId, selected);
    setPendingResourceId(resourceId);

    startTransition(async () => {
      setOptimisticIds(nextIds);
      try {
        const result = await setQuickLinkAction(resourceId, selected);
        const succeeded = result.status === "success";
        setConfirmedIds(reconcileQuickLinkIds({ previousIds, optimisticIds: nextIds, succeeded }));
        setToast({ kind: succeeded ? "success" : "error", message: result.message });
      } catch {
        setConfirmedIds(previousIds);
        setToast({ kind: "error", message: "Quick Link could not be updated. Please try again." });
      } finally {
        setPendingResourceId(null);
        pendingRef.current = false;
      }
    });
  }

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
        <p className="text-sm font-semibold">Quick Links: {selectedCount} selected</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose the resources people need most often.</p>
        {selectedCount > QUICK_LINK_GUIDANCE_THRESHOLD && (
          <p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            You have {selectedCount} Quick Links selected. Keeping this list focused makes it easier to use.
          </p>
        )}
      </div>

      {resources.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
          <h3 className="text-lg font-semibold">No resources yet</h3>
        </div>
      ) : (
        <section className="space-y-4">
          {resources.map((resource) => {
            const selected = optimisticIds.includes(resource.id);
            const saving = pendingResourceId === resource.id;
            return (
              <article key={resource.id} className={`rounded-2xl border bg-white p-5 shadow-sm transition dark:bg-[#242424] ${saving ? "border-amber-400/70 opacity-80 dark:border-amber-600/70" : "border-slate-200 dark:border-[#3a3a3a]"}`}>
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-semibold">{resource.title}</h3>
                      {resource.is_active && <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-500/30 dark:text-green-300">Active</span>}
                      <button
                        type="button"
                        onClick={() => updateQuickLink(resource.id, !selected)}
                        disabled={mutationPending || !resource.is_active}
                        aria-label={selected ? `Remove ${resource.title} from Quick Links` : `Add ${resource.title} to Quick Links`}
                        title={!resource.is_active ? "Inactive resources cannot be Quick Links" : selected ? "Remove from Quick Links" : "Add to Quick Links"}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "bg-amber-500/15 text-amber-800 ring-amber-500/35 hover:bg-amber-500/25 dark:text-amber-300" : "bg-slate-100 text-slate-600 ring-slate-300 hover:bg-amber-500/10 hover:text-amber-800 hover:ring-amber-500/35 dark:bg-black/30 dark:text-slate-300 dark:ring-slate-600 dark:hover:text-amber-300"}`}
                      >
                        {saving ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />Saving…</> : <><StarIcon selected={selected} />{selected ? "Quick Link" : "Add to Quick Links"}</>}
                      </button>
                    </div>
                    {resource.description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{resource.description}</p>}
                    {resource.category && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Category: {resource.category}</p>}
                  </div>
                </div>
                <div className="mt-5 flex gap-3 border-t border-slate-200 pt-4 dark:border-[#3a3a3a]">
                  <Link href={`/${school}/admin/resources/${resource.id}/edit`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10">Edit</Link>
                  <form action={deleteAction}>
                    <input type="hidden" name="resource_id" value={resource.id} />
                    <button type="submit" disabled={mutationPending} className="cursor-pointer rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40">Delete</button>
                  </form>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <p className="sr-only" role="status" aria-live="polite">{mutationPending ? "Updating Quick Link" : ""}</p>
      {toast && createPortal(<div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex justify-center px-4"><p role={toast.kind === "error" ? "alert" : "status"} aria-live={toast.kind === "error" ? "assertive" : "polite"} className={`notification-toast rounded-xl px-4 py-3 text-sm font-bold text-white shadow-xl ${toast.kind === "success" ? "bg-emerald-700" : "bg-red-700"}`}>{toast.message}</p></div>, document.body)}
    </>
  );
}
