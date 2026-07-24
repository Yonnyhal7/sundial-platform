import { getMillisecondsUntilNextMidnight } from "@/lib/timezones";

export const SCHOOL_DATA_REFRESH_COALESCE_MS = 250;

export type SchoolDataRefreshResult =
  | { status: "current" }
  | { status: "offline" }
  | { status: "unavailable" }
  | { status: "error" };

type RefreshReason = "foreground" | "online" | "midnight";

type SchoolDataRefreshLifecycleOptions = {
  window: Window;
  document: Document;
  timeZone: string;
  refreshSnapshot: () => Promise<SchoolDataRefreshResult>;
  refreshRoute: () => void;
  markOffline: () => void;
  hasUnsavedWork?: () => boolean;
  now?: () => Date;
  coalesceMs?: number;
  setTimeout?: typeof window.setTimeout;
  clearTimeout?: typeof window.clearTimeout;
};

export function startSchoolDataRefreshLifecycle(
  options: SchoolDataRefreshLifecycleOptions
) {
  const now = options.now || (() => new Date());
  const setTimeoutFn =
    options.setTimeout || options.window.setTimeout.bind(options.window);
  const clearTimeoutFn =
    options.clearTimeout || options.window.clearTimeout.bind(options.window);
  const coalesceMs =
    options.coalesceMs ?? SCHOOL_DATA_REFRESH_COALESCE_MS;
  let disposed = false;
  let pendingTimer: number | null = null;
  let midnightTimer: number | null = null;
  let inFlight: Promise<void> | null = null;
  let runAgain = false;
  let pendingReason: RefreshReason | null = null;

  const scheduleMidnight = () => {
    if (midnightTimer) clearTimeoutFn(midnightTimer);
    midnightTimer = setTimeoutFn(() => {
      midnightTimer = null;
      requestRefresh("midnight");
      scheduleMidnight();
    }, getMillisecondsUntilNextMidnight(options.timeZone, now()));
  };

  const runRefresh = () => {
    if (disposed) return Promise.resolve();
    if (inFlight) {
      runAgain = true;
      return inFlight;
    }

    pendingReason = null;
    inFlight = (async () => {
      const result = await options.refreshSnapshot();
      if (
        !disposed &&
        result.status !== "offline" &&
        options.window.navigator.onLine &&
        !options.hasUnsavedWork?.()
      ) {
        options.refreshRoute();
      }
    })().finally(() => {
      inFlight = null;
      if (runAgain && !disposed) {
        runAgain = false;
        requestRefresh("foreground");
      }
    });
    return inFlight;
  };

  const requestRefresh = (reason: RefreshReason) => {
    if (disposed) return;
    pendingReason = reason;
    if (pendingTimer) return;
    pendingTimer = setTimeoutFn(() => {
      pendingTimer = null;
      if (pendingReason) void runRefresh();
    }, coalesceMs);
  };

  const handleVisibilityChange = () => {
    if (options.document.visibilityState === "visible") {
      requestRefresh("foreground");
    }
  };
  const handleOnline = () => requestRefresh("online");
  const handleOffline = () => options.markOffline();

  options.document.addEventListener("visibilitychange", handleVisibilityChange);
  options.window.addEventListener("online", handleOnline);
  options.window.addEventListener("offline", handleOffline);
  scheduleMidnight();

  return {
    requestRefresh,
    dispose() {
      disposed = true;
      options.document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      options.window.removeEventListener("online", handleOnline);
      options.window.removeEventListener("offline", handleOffline);
      if (pendingTimer) clearTimeoutFn(pendingTimer);
      if (midnightTimer) clearTimeoutFn(midnightTimer);
    },
  };
}
