"use client";

import { useRouter } from "next/navigation";
import { BackArrowIcon } from "@/components/admin/AdminNavIcons";
import {
  canLeaveNotificationComposer,
  canUseNotificationsIndexHistory,
} from "@/lib/notificationNavigation";

export default function NotificationBackButton({
  fallbackHref,
  protectUnsaved = false,
}: {
  fallbackHref: string;
  protectUnsaved?: boolean;
}) {
  const router = useRouter();

  function goBack() {
    const canLeave = canLeaveNotificationComposer({
      protectUnsaved,
      dirty: document.body.dataset.notificationComposerDirty === "true",
      confirmDiscard: () =>
        window.confirm("Discard this unsaved notification?"),
    });
    if (!canLeave) return;

    const canUseHistory = canUseNotificationsIndexHistory({
      historyLength: window.history.length,
      referrer: document.referrer,
      currentOrigin: window.location.origin,
      fallbackHref,
    });

    if (canUseHistory) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back to Notifications"
      className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold shadow-sm transition hover:bg-slate-50 dark:border-[#3a3a3a] dark:bg-[#242424] dark:hover:bg-[#303030]"
    >
      <BackArrowIcon className="h-5 w-5" />
      Back to Notifications
    </button>
  );
}
