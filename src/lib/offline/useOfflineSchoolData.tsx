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
import type { SchoolDataRefreshResult } from "@/lib/offline/schoolDataRefreshLifecycle";

const ACTIVE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type OfflineSchoolDataContextValue = {
  schoolId: string;
  schoolSlug: string;
  snapshot: SchoolOfflineSnapshot | null;
  syncState: OfflineSyncState;
  isOnline: boolean;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  refresh: () => Promise<SchoolDataRefreshResult>;
  markOffline: () => void;
};

const OfflineSchoolDataContext =
  createContext<OfflineSchoolDataContextValue | null>(null);

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
  const syncingRef = useRef<Promise<SchoolDataRefreshResult> | null>(null);
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
        return { status: "offline" } as const;
      }

      setSyncState("syncing");

      try {
        const nextSnapshot = await fetchAndStoreSchoolSnapshot(schoolSlug, schoolId);

        if (!mountedRef.current) return { status: "error" } as const;

        if (nextSnapshot.schoolId === schoolId) {
          setSnapshot(nextSnapshot);
          setLastError(null);
          setIsOnline(true);
          setSyncState("current");
          return { status: "current" } as const;
        }
        return { status: "error" } as const;
      } catch (error) {
        if (!mountedRef.current) return { status: "error" } as const;

        if (error instanceof SchoolSnapshotUnavailableError) {
          snapshotRef.current = null;
          setSnapshot(null);
          setLastError(error.message);
          setSyncState("offline-empty");
          return { status: "unavailable" } as const;
        }

        setLastError(error instanceof Error ? error.message : "Snapshot refresh failed");
        setSyncState(snapshotRef.current ? "cached" : "error");
        return { status: "error" } as const;
      }
    })().finally(() => {
      syncingRef.current = null;
    });

    syncingRef.current = sync;

    return sync;
  }, [schoolId, schoolSlug]);

  const markOffline = useCallback(() => {
    setIsOnline(false);
    setSyncState(snapshotRef.current ? "cached" : "offline-empty");
  }, []);

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
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, ACTIVE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
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
        markOffline,
      };
    },
    [isOnline, lastError, markOffline, refresh, schoolId, schoolSlug, snapshot, syncState]
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
