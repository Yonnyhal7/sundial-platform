"use client";

import { clearSchoolSnapshot, saveSchoolSnapshot } from "@/lib/offline/db";
import { assertValidSchoolOfflineSnapshot } from "@/lib/offline/schoolSnapshot";
import type { SchoolOfflineSnapshot } from "@/lib/offline/types";

const inFlightSyncs = new Map<string, Promise<SchoolOfflineSnapshot>>();

export class SchoolSnapshotUnavailableError extends Error {
  constructor() {
    super("This school is currently unavailable");
    this.name = "SchoolSnapshotUnavailableError";
  }
}

function purgeSchoolNavigationCache(schoolSlug: string) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type: "PURGE_SCHOOL_CACHE", schoolSlug });
  });
}

export async function fetchAndStoreSchoolSnapshot(
  schoolSlug: string,
  expectedSchoolId: string
) {
  const normalizedSchoolSlug = schoolSlug.trim().toLowerCase();
  const syncKey = `${expectedSchoolId}:${normalizedSchoolSlug}`;
  const existing = inFlightSyncs.get(syncKey);

  if (existing) return existing;

  const syncPromise = fetch(
    `/api/schools/${encodeURIComponent(normalizedSchoolSlug)}/offline-snapshot`,
    {
      cache: "no-store",
    }
  )
    .then(async (response) => {
      if (!response.ok) {
        if (response.status === 404 || response.status === 410) {
          await clearSchoolSnapshot(expectedSchoolId);
          purgeSchoolNavigationCache(normalizedSchoolSlug);
          throw new SchoolSnapshotUnavailableError();
        }
        throw new Error(`Snapshot refresh failed with ${response.status}`);
      }

      const snapshot = (await response.json()) as unknown;

      assertValidSchoolOfflineSnapshot(snapshot);
      if (snapshot.schoolId !== expectedSchoolId) {
        throw new Error("Snapshot tenant does not match the active school");
      }
      await saveSchoolSnapshot(snapshot);

      return snapshot;
    })
    .finally(() => {
      inFlightSyncs.delete(syncKey);
    });

  inFlightSyncs.set(syncKey, syncPromise);

  return syncPromise;
}
