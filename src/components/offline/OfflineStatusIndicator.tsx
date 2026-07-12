"use client";

import { useOfflineSchoolData } from "@/lib/offline/useOfflineSchoolData";

function formatSyncTime(value: string | null) {
  if (!value) return null;

  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OfflineStatusIndicator({
  variant = "app",
}: {
  variant?: "app" | "kiosk";
}) {
  const { isOnline, syncState, lastSuccessfulSyncAt } = useOfflineSchoolData();
  const lastUpdated = formatSyncTime(lastSuccessfulSyncAt);
  const showOffline = !isOnline || syncState === "cached" || syncState === "offline-empty";
  const showRefreshing = isOnline && syncState === "syncing";

  if (!showOffline && !showRefreshing) return null;

  return (
    <div
      className={[
        "pointer-events-none fixed z-[70] rounded-full border px-3 py-1.5 text-[0.7rem] font-black shadow-sm backdrop-blur",
        variant === "kiosk"
          ? "right-4 top-4 border-slate-300 bg-white/85 text-slate-600 dark:border-[#3a3a3a] dark:bg-black/70 dark:text-[#d4d4d4]"
          : "left-1/2 top-[calc(env(safe-area-inset-top)+0.5rem)] -translate-x-1/2 border-slate-200 bg-white/90 text-slate-600 dark:border-[#3a3a3a] dark:bg-[#242424]/90 dark:text-[#d4d4d4]",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      {showRefreshing
        ? "Refreshing"
        : lastUpdated
          ? `Offline · Last updated ${lastUpdated}`
          : "Offline"}
    </div>
  );
}
