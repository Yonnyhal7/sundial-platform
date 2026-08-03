"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { DeleteCalendarWizardDraftResult } from "./actions";

export type SavedProgressCard = { key: string; title: string; href: string; draftId: string; schoolYearLabel: string | null; updatedAt: string; completionPercentage: number; detail: string };

export default function SavedProgressCards({ initialCards, deleteAction }: { initialCards: SavedProgressCard[]; deleteAction: (input: { draftId: string; schoolYearLabel: string | null }) => Promise<DeleteCalendarWizardDraftResult> }) {
  const [cards, setCards] = useState(initialCards);
  const [pendingCard, setPendingCard] = useState<SavedProgressCard | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [isDeleting, startDeleting] = useTransition();
  const deleteTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const confirmRef = useRef<HTMLButtonElement>(null);

  const closeDialog = useCallback(() => {
    const card = pendingCard;
    setPendingCard(null);
    if (card) window.setTimeout(() => deleteTriggerRefs.current.get(card.draftId)?.focus(), 0);
  }, [pendingCard]);

  useEffect(() => {
    if (!pendingCard) return;
    const timer = window.setTimeout(() => confirmRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeDialog(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", onKeyDown); };
  }, [pendingCard, closeDialog]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.kind === "success" ? 2500 : 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function confirmDeletion() {
    if (!pendingCard) return;
    const card = pendingCard;
    startDeleting(async () => {
      const result = await deleteAction({ draftId: card.draftId, schoolYearLabel: card.schoolYearLabel });
      if (result.status !== "success") {
        setToast({ kind: "error", message: result.message });
        setPendingCard(null);
        return;
      }
      setCards((current) => current.filter((item) => item.draftId !== card.draftId));
      setPendingCard(null);
      setToast({ kind: "success", message: "Saved calendar setup deleted." });
    });
  }

  if (cards.length === 0 && !toast) return null;
  return <>
    {cards.length > 0 && <section className="mb-8 grid gap-4 lg:grid-cols-2">{cards.map((card) => <div key={card.draftId} className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#9A7209] dark:text-[#F6C64A]">Saved Progress</p>
      <h2 className="mt-2 text-2xl font-bold">{card.title}</h2>
      <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{card.schoolYearLabel || "School-Year Calendar Draft"} · {card.completionPercentage}% complete · Last updated {new Date(card.updatedAt).toLocaleString()}</p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{card.detail}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={card.href} className="inline-flex items-center justify-center rounded-lg bg-[var(--school-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--school-primary-text)] shadow-sm transition hover:opacity-90">Resume</Link>
        <Link href={`${card.href}?startOver=1`} className="inline-flex items-center justify-center rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950/40">Start Over</Link>
        <button ref={(node) => { if (node) deleteTriggerRefs.current.set(card.draftId, node); }} type="button" onClick={() => setPendingCard(card)} className="inline-flex items-center justify-center rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40">Delete Saved Progress</button>
      </div>
    </div>)}</section>}
    {pendingCard && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center px-4" role="dialog" aria-modal="true" aria-labelledby="delete-progress-title" aria-describedby="delete-progress-description">
      <button type="button" aria-label="Cancel deleting saved progress" className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-sm" onClick={closeDialog} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700 dark:text-red-300">Delete unfinished setup</p>
        <h2 id="delete-progress-title" className="mt-2 text-xl font-bold">Delete this saved calendar setup?</h2>
        <p id="delete-progress-description" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Your unfinished wizard progress will be permanently deleted. Your existing calendar will not be affected.</p>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">This does not delete or change schedule templates, assigned school days, or a completed AI import.</p>
        <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={isDeleting} onClick={closeDialog} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Cancel</button><button ref={confirmRef} type="button" disabled={isDeleting} onClick={confirmDeletion} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60">{isDeleting ? "Deleting…" : "Delete Progress"}</button></div>
      </div>
    </div>, document.body)}
    {toast && createPortal(<div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex justify-center px-4"><p role={toast.kind === "error" ? "alert" : "status"} aria-live={toast.kind === "error" ? "assertive" : "polite"} className={`notification-toast rounded-xl px-4 py-3 text-sm font-bold shadow-xl ${toast.kind === "success" ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}>{toast.message}</p></div>, document.body)}
  </>;
}
