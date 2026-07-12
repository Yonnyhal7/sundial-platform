"use client";

import {
  assertValidSchoolOfflineSnapshot,
  getSnapshotStorageKey,
} from "@/lib/offline/schoolSnapshot";
import type { SchoolOfflineSnapshot } from "@/lib/offline/types";

const DB_NAME = "sundial-offline";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "schoolSnapshots";
const METADATA_STORE = "syncMetadata";

type OfflineStoreName = typeof SNAPSHOT_STORE | typeof METADATA_STORE;

let dbPromise: Promise<IDBDatabase> | null = null;

function openOfflineDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE);
      }

      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB"));
  });

  return dbPromise;
}

async function runStoreRequest<T>(
  storeName: OfflineStoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
) {
  const db = await openOfflineDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}

export async function loadSchoolSnapshot(schoolId: string) {
  try {
    const snapshot = await runStoreRequest<SchoolOfflineSnapshot | undefined>(
      SNAPSHOT_STORE,
      "readonly",
      (store) => store.get(getSnapshotStorageKey(schoolId))
    );

    if (!snapshot) return null;

    assertValidSchoolOfflineSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    console.warn("[offline] unable to load school snapshot", {
      schoolId,
      error,
    });
    return null;
  }
}

export async function saveSchoolSnapshot(snapshot: SchoolOfflineSnapshot) {
  assertValidSchoolOfflineSnapshot(snapshot);

  await runStoreRequest(
    SNAPSHOT_STORE,
    "readwrite",
    (store) => store.put(snapshot, getSnapshotStorageKey(snapshot.schoolId))
  );

  await runStoreRequest(METADATA_STORE, "readwrite", (store) =>
    store.put(
      {
        schoolId: snapshot.schoolId,
        schoolSlug: snapshot.schoolSlug,
        syncedAt: snapshot.syncedAt,
      },
      snapshot.schoolId
    )
  );
}

export async function clearSchoolSnapshot(schoolId: string) {
  await runStoreRequest(SNAPSHOT_STORE, "readwrite", (store) =>
    store.delete(getSnapshotStorageKey(schoolId))
  );
  await runStoreRequest(METADATA_STORE, "readwrite", (store) =>
    store.delete(schoolId)
  );
}

export async function clearAllSundialOfflineData() {
  const db = await openOfflineDb();

  await Promise.all(
    [SNAPSHOT_STORE, METADATA_STORE].map(
      (storeName) =>
        new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(storeName, "readwrite");
          const request = transaction.objectStore(storeName).clear();

          request.onsuccess = () => resolve();
          request.onerror = () =>
            reject(request.error || new Error("Unable to clear offline store"));
        })
    )
  );
}
