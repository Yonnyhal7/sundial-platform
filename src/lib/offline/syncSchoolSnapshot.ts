"use client";

import { saveSchoolSnapshot } from "@/lib/offline/db";
import { assertValidSchoolOfflineSnapshot } from "@/lib/offline/schoolSnapshot";
import type { SchoolOfflineSnapshot } from "@/lib/offline/types";

const inFlightSyncs = new Map<string, Promise<SchoolOfflineSnapshot>>();

export async function fetchAndStoreSchoolSnapshot(schoolSlug: string) {
  const normalizedSchoolSlug = schoolSlug.trim().toLowerCase();
  const existing = inFlightSyncs.get(normalizedSchoolSlug);

  if (existing) return existing;

  const syncPromise = fetch(
    `/api/schools/${encodeURIComponent(normalizedSchoolSlug)}/offline-snapshot`,
    {
      cache: "no-store",
    }
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Snapshot refresh failed with ${response.status}`);
      }

      const snapshot = (await response.json()) as unknown;

      assertValidSchoolOfflineSnapshot(snapshot);
      await saveSchoolSnapshot(snapshot);

      return snapshot;
    })
    .finally(() => {
      inFlightSyncs.delete(normalizedSchoolSlug);
    });

  inFlightSyncs.set(normalizedSchoolSlug, syncPromise);

  return syncPromise;
}
