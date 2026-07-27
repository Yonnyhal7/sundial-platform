"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

type MutationResult =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export default function NotificationCampaignMenu({
  detailsHref,
  archived,
  duplicateAction,
  archiveAction,
  restoreAction,
  deleteAction,
}: {
  detailsHref: string;
  archived: boolean;
  duplicateAction: () => Promise<void>;
  archiveAction: () => Promise<MutationResult>;
  restoreAction: () => Promise<MutationResult>;
  deleteAction: () => Promise<MutationResult>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmDelete) cancelButtonRef.current?.focus();
  }, [confirmDelete]);

  function mutate(action: () => Promise<MutationResult>, closeDialog = false) {
    setError("");
    startTransition(async () => {
      try {
        const result = await action();
        if (result && !result.ok) {
          setError(result.error);
          return;
        }
        if (closeDialog) setConfirmDelete(false);
      } catch {
        setError("The notification campaign could not be updated. Try again.");
      }
    });
  }

  return (
    <>
      <details className="relative">
        <summary
          aria-label="Notification campaign actions"
          className="grid min-h-11 min-w-11 cursor-pointer list-none place-items-center rounded-full text-xl font-black hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] dark:hover:bg-[#333]"
        >
          ⋮
        </summary>
        <div className="absolute right-0 z-20 mt-1 min-w-44 overflow-hidden rounded-xl border bg-white p-1 shadow-xl dark:border-[#444] dark:bg-[#2b2b2b]">
          <Link href={detailsHref} className="block rounded-lg px-3 py-2 text-sm font-bold hover:bg-slate-100 dark:hover:bg-[#3a3a3a]">
            View Details
          </Link>
          {archived ? (
            <>
              <button disabled={pending} type="button" onClick={() => mutate(restoreAction)} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-[#3a3a3a]">
                Restore
              </button>
              <button ref={deleteButtonRef} disabled={pending} type="button" onClick={() => { setError(""); setConfirmDelete(true); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/30">
                Permanently Delete
              </button>
            </>
          ) : (
            <>
              <form action={duplicateAction}>
                <button disabled={pending} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-[#3a3a3a]">
                  Duplicate
                </button>
              </form>
              <button disabled={pending} type="button" onClick={() => mutate(archiveAction)} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-[#3a3a3a]">
                Archive
              </button>
            </>
          )}
          {error && !confirmDelete && <p role="alert" className="px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300">{error}</p>}
        </div>
      </details>
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-5" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-campaign-title" aria-describedby="delete-campaign-body" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#242424]">
            <h2 id="delete-campaign-title" className="text-xl font-black">Delete notification campaign permanently?</h2>
            <p id="delete-campaign-body" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              This removes the campaign from the admin history.
              <br /><br />
              Notifications already delivered to users will remain on their devices.
            </p>
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button ref={cancelButtonRef} disabled={pending} type="button" onClick={() => { setConfirmDelete(false); setError(""); deleteButtonRef.current?.focus(); }} className="min-h-11 rounded-xl border px-4 font-bold disabled:opacity-60">
                Cancel
              </button>
              <button disabled={pending} type="button" onClick={() => mutate(deleteAction, true)} className="min-h-11 rounded-xl bg-red-600 px-4 font-bold text-white disabled:opacity-60">
                {pending ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
