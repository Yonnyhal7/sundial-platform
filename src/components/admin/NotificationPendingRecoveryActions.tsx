"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  cancelNotificationCampaignPendingAction,
  retryNotificationCampaignPendingAction,
} from "@/app/[school]/admin/notifications/actions";

type Resolution = "retry" | "cancel";
type MutationResult =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export default function NotificationPendingRecoveryActions({
  school,
  campaignId,
  version,
  pendingCount,
  active,
}: {
  school: string;
  campaignId: string;
  version: number;
  pendingCount: number;
  active: boolean;
}) {
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const retryTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelDialogButtonRef = useRef<HTMLButtonElement>(null);
  const wasActiveRef = useRef(active);

  const closeDialog = useCallback((restoreFocus: boolean) => {
    const previousResolution = resolution;
    setResolution(null);
    if (restoreFocus && previousResolution) {
      window.requestAnimationFrame(() => {
        const trigger = previousResolution === "retry"
          ? retryTriggerRef.current
          : cancelTriggerRef.current;
        trigger?.focus({ preventScroll: true });
      });
    }
  }, [resolution]);

  useEffect(() => {
    if (!resolution) return;
    cancelDialogButtonRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        closeDialog(true);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled)'
        ) || []
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDialog, pending, resolution]);

  useEffect(() => {
    if (wasActiveRef.current && !active && announcement) {
      document.getElementById("campaign-status-badge")?.focus({
        preventScroll: true,
      });
    }
    wasActiveRef.current = active;
  }, [active, announcement]);

  function openDialog(nextResolution: Resolution) {
    setError("");
    setAnnouncement("");
    setResolution(nextResolution);
  }

  function dialogKeyboardNavigation(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && event.target === event.currentTarget) {
      event.preventDefault();
    }
  }

  function submitResolution() {
    if (!resolution || pending) return;
    const selectedResolution = resolution;
    setError("");
    startTransition(async () => {
      let result: MutationResult;
      try {
        result = selectedResolution === "retry"
          ? await retryNotificationCampaignPendingAction(
            school,
            campaignId,
            version
          )
          : await cancelNotificationCampaignPendingAction(
            school,
            campaignId,
            version
          );
      } catch {
        result = {
          ok: false,
          error: "The pending deliveries could not be resolved. Try again.",
        };
      }
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      setAnnouncement(
        selectedResolution === "retry"
          ? "Pending delivery retry requested."
          : "Remaining pending deliveries cancelled."
      );
      closeDialog(true);
    });
  }

  const confirmation = resolution === "retry"
    ? `Retry delivery to the remaining ${pendingCount} devices? Devices that already received this notification will not be sent it again.`
    : `Cancel the remaining ${pendingCount} deliveries? These devices will not receive this notification. Already delivered notifications will not be affected.`;

  return (
    <>
      {active && (
        <section
          aria-labelledby="pending-delivery-recovery-title"
          className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30"
        >
          <h2 id="pending-delivery-recovery-title" className="text-lg font-black">
            Action required
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-950 dark:text-amber-100">
            Some deliveries remain pending. Choose whether to retry them or cancel
            the remaining deliveries.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              ref={retryTriggerRef}
              type="button"
              disabled={pending}
              onClick={() => openDialog("retry")}
              className="min-h-11 rounded-xl bg-[var(--school-primary)] px-4 font-bold text-[var(--school-primary-text)] focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] focus:ring-offset-2 disabled:opacity-60"
            >
              Retry pending deliveries
            </button>
            <button
              ref={cancelTriggerRef}
              type="button"
              disabled={pending}
              onClick={() => openDialog("cancel")}
              className="min-h-11 rounded-xl border border-red-400 px-4 font-bold text-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:opacity-60 dark:text-red-300"
            >
              Cancel remaining deliveries
            </button>
          </div>
        </section>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {active && resolution && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[150] grid place-items-center bg-black/55 p-5"
          role="presentation"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pending-resolution-dialog-title"
            aria-describedby="pending-resolution-dialog-description"
            onKeyDown={dialogKeyboardNavigation}
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#242424]"
          >
            <h2 id="pending-resolution-dialog-title" className="text-xl font-black">
              {resolution === "retry"
                ? "Retry pending deliveries?"
                : "Cancel remaining deliveries?"}
            </h2>
            <p
              id="pending-resolution-dialog-description"
              className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300"
            >
              {confirmation}
            </p>
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                ref={cancelDialogButtonRef}
                type="button"
                disabled={pending}
                onClick={() => closeDialog(true)}
                className="min-h-11 rounded-xl border px-4 font-bold focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] disabled:opacity-60"
              >
                Keep pending
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={submitResolution}
                className={`min-h-11 rounded-xl px-4 font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 ${
                  resolution === "retry"
                    ? "bg-[var(--school-primary)] text-[var(--school-primary-text)] focus:ring-[var(--school-primary)]"
                    : "bg-red-700 focus:ring-red-700"
                }`}
              >
                {pending
                  ? resolution === "retry" ? "Requesting retry…" : "Cancelling…"
                  : resolution === "retry" ? "Retry deliveries" : "Cancel deliveries"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
