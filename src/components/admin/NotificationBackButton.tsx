"use client";

import { useRouter } from "next/navigation";
import { MegaphoneIcon } from "@/components/admin/AdminNavIcons";

export default function NotificationBackButton({
  fallbackHref,
  protectUnsaved = false,
}: {
  fallbackHref: string;
  protectUnsaved?: boolean;
}) {
  const router = useRouter();

  function goBack() {
    if (
      protectUnsaved &&
      document.body.dataset.notificationComposerDirty === "true" &&
      !window.confirm("Discard this unsaved notification?")
    ) {
      return;
    }

    let canUseHistory = false;
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      canUseHistory =
        window.history.length > 1 &&
        referrer?.origin === window.location.origin &&
        referrer.pathname.includes("/notifications");
    } catch {
      canUseHistory = false;
    }

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
      <MegaphoneIcon className="h-5 w-5" />
      Notifications
    </button>
  );
}
