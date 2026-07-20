"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadSchoolSnapshot } from "@/lib/offline/db";
import {
  fetchAndStoreSchoolSnapshot,
  SchoolSnapshotUnavailableError,
} from "@/lib/offline/syncSchoolSnapshot";
import { shouldUseSnapshotForSchool } from "@/lib/offline/schoolSnapshot";
import type {
  OfflineSyncState,
  SchoolOfflineSnapshot,
} from "@/lib/offline/types";
import {
  getBrowserOnlineState,
  getHydrationSafeInitialOnlineState,
} from "@/lib/offline/onlineState";

const ACTIVE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type OfflineSchoolDataContextValue = {
  schoolId: string;
  schoolSlug: string;
  snapshot: SchoolOfflineSnapshot | null;
  syncState: OfflineSyncState;
  isOnline: boolean;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  refresh: () => Promise<void>;
};

const OfflineSchoolDataContext =
  createContext<OfflineSchoolDataContextValue | null>(null);

function getMillisecondsUntilNextLocalMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);

  return Math.max(1000, next.getTime() - now.getTime());
}

export function OfflineSchoolDataProvider({
  schoolId,
  schoolSlug,
  children,
}: {
  schoolId: string;
  schoolSlug: string;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<SchoolOfflineSnapshot | null>(null);
  const [syncState, setSyncState] = useState<OfflineSyncState>("loading-cache");
  const [isOnline, setIsOnline] = useState(getHydrationSafeInitialOnlineState);
  const [lastError, setLastError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const syncingRef = useRef<Promise<void> | null>(null);
  const snapshotRef = useRef<SchoolOfflineSnapshot | null>(null);

  useEffect(() => {
    snapshotRef.current = shouldUseSnapshotForSchool(snapshot, schoolId)
      ? snapshot
      : null;
  }, [schoolId, snapshot]);

  const refresh = useCallback(async () => {
    if (syncingRef.current) {
      return syncingRef.current;
    }

    const sync = (async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setIsOnline(false);
        setSyncState(snapshotRef.current ? "cached" : "offline-empty");
        return;
      }

      setSyncState("syncing");

      try {
        const nextSnapshot = await fetchAndStoreSchoolSnapshot(schoolSlug, schoolId);

        if (!mountedRef.current) return;

        if (nextSnapshot.schoolId === schoolId) {
          setSnapshot(nextSnapshot);
          setLastError(null);
          setIsOnline(true);
          setSyncState("current");
        }
      } catch (error) {
        if (!mountedRef.current) return;

        if (error instanceof SchoolSnapshotUnavailableError) {
          snapshotRef.current = null;
          setSnapshot(null);
          setLastError(error.message);
          setSyncState("offline-empty");
          return;
        }

        setLastError(error instanceof Error ? error.message : "Snapshot refresh failed");
        setSyncState(snapshotRef.current ? "cached" : "error");
      }
    })().finally(() => {
      syncingRef.current = null;
    });

    syncingRef.current = sync;

    return sync;
  }, [schoolId, schoolSlug]);

  useEffect(() => {
    mountedRef.current = true;
    const onlineStateTimeout = window.setTimeout(() => {
      setIsOnline(getBrowserOnlineState());
    }, 0);

    return () => {
      window.clearTimeout(onlineStateTimeout);
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setSyncState("loading-cache");
      }
    }, 0);

    loadSchoolSnapshot(schoolId).then((cachedSnapshot) => {
      if (cancelled || !mountedRef.current) return;

      if (cachedSnapshot?.schoolId === schoolId) {
        setSnapshot(cachedSnapshot);
        setSyncState(navigator.onLine ? "cached" : "cached");
      } else {
        setSyncState(navigator.onLine ? "idle" : "offline-empty");
      }

      void refresh();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [refresh, schoolId]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      void refresh();
    }

    function handleOffline() {
      setIsOnline(false);
      setSyncState(
        shouldUseSnapshotForSchool(snapshot, schoolId) ? "cached" : "offline-empty"
      );
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        setIsOnline(navigator.onLine);
        void refresh();
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh, schoolId, snapshot]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, ACTIVE_REFRESH_INTERVAL_MS);

    const midnightTimeout = window.setTimeout(() => {
      void refresh();
    }, getMillisecondsUntilNextLocalMidnight());

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(midnightTimeout);
    };
  }, [refresh]);

  const value = useMemo<OfflineSchoolDataContextValue>(
    () => {
      const activeSnapshot = shouldUseSnapshotForSchool(snapshot, schoolId)
        ? snapshot
        : null;

      return {
        schoolId,
        schoolSlug,
        snapshot: activeSnapshot,
        syncState,
        isOnline,
        lastSuccessfulSyncAt: activeSnapshot?.syncedAt || null,
        lastError,
        refresh,
      };
    },
    [isOnline, lastError, refresh, schoolId, schoolSlug, snapshot, syncState]
  );

  return (
    <OfflineSchoolDataContext.Provider value={value}>
      {children}
    </OfflineSchoolDataContext.Provider>
  );
}

export function useOfflineSchoolData() {
  const context = useContext(OfflineSchoolDataContext);

  if (!context) {
    throw new Error("useOfflineSchoolData must be used inside OfflineSchoolDataProvider");
  }

  return context;
}
