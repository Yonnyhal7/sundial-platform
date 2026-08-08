"use client";

import { useCallback, useState, type RefObject } from "react";
import NotificationAudienceSummary from "@/components/mobile-app/NotificationAudienceSummary";
import NotificationDetail from "@/components/mobile-app/NotificationDetail";
import NotificationInbox from "@/components/mobile-app/NotificationInbox";
import PeriodReminderPreference from "@/components/mobile-app/PeriodReminderPreference";
import OverlayDrawer from "@/components/mobile-app/OverlayDrawer";
import type { NotificationAudience } from "@/lib/notifications";

type View = { kind: "list" } | { kind: "detail"; deliveryId: string } | { kind: "settings" };

type Props = {
  open: boolean;
  onClose: () => void;
  bellRef?: RefObject<HTMLElement | null>;
  school: string;
  schoolId: string;
  timeZone: string;
  initialAudience?: NotificationAudience | null;
  historyDismiss?: boolean;
  initialDeliveryId?: string;
};

export default function NotificationDrawer({
  open,
  onClose,
  bellRef,
  school,
  schoolId,
  timeZone,
  initialAudience = null,
  historyDismiss = true,
  initialDeliveryId,
}: Props) {
  const [view, setView] = useState<View>(
    initialDeliveryId ? { kind: "detail", deliveryId: initialDeliveryId } : { kind: "list" }
  );
  const close = useCallback(() => {
    onClose();
    window.setTimeout(() => setView({ kind: "list" }), 260);
  }, [onClose]);
  const dismiss = useCallback(() => {
    if (historyDismiss) window.history.back();
    else close();
  }, [close, historyDismiss]);

  return (
    <OverlayDrawer
      open={open}
      onClose={close}
      returnFocusRef={bellRef}
      side="right"
      label="Notifications"
      historyDismiss={historyDismiss}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 bg-[var(--school-primary)] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-[var(--school-primary-text)]">
          <p className="text-lg font-black">
            {view.kind === "detail"
              ? "Notification"
              : view.kind === "settings"
                ? "Notification settings"
                : "Notifications"}
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close notifications"
            className="grid h-11 w-11 place-items-center rounded-full border border-[color-mix(in_srgb,var(--school-primary-text)_28%,transparent)] text-2xl font-bold"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-5">
          {view.kind === "list" && (
            <NotificationInbox
              school={school}
              schoolId={schoolId}
              timeZone={timeZone}
              initialAudience={initialAudience}
              onSelect={(deliveryId) => setView({ kind: "detail", deliveryId })}
              onOpenSettings={() => setView({ kind: "settings" })}
            />
          )}
          {view.kind === "detail" && (
            <NotificationDetail
              deliveryId={view.deliveryId}
              school={school}
              schoolId={schoolId}
              timeZone={timeZone}
              onBack={() => setView({ kind: "list" })}
              onDeleted={() => setView({ kind: "list" })}
            />
          )}
          {view.kind === "settings" && (
            <main>
              <button
                type="button"
                onClick={() => setView({ kind: "list" })}
                className="inline-flex min-h-11 items-center rounded-2xl px-3 font-black"
              >
                ← Back to Notifications
              </button>
              <section className="mt-4 rounded-3xl bg-[var(--school-primary)] p-5 text-[var(--school-primary-text)]">
                <NotificationAudienceSummary audience={initialAudience} />
              </section>
              <PeriodReminderPreference school={school} schoolId={schoolId} />
            </main>
          )}
        </div>
      </div>
    </OverlayDrawer>
  );
}
