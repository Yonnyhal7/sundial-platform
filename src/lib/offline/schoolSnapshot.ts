import {
  SCHOOL_OFFLINE_SCHEMA_VERSION,
  type SchoolOfflineSnapshot,
} from "@/lib/offline/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getSnapshotStorageKey(schoolId: string) {
  return `schoolSnapshot:${schoolId}`;
}

export function getSyncMetadataStorageKey(schoolId: string) {
  return `syncMetadata:${schoolId}`;
}

export function isValidSchoolOfflineSnapshot(
  value: unknown
): value is SchoolOfflineSnapshot {
  if (!isRecord(value)) return false;

  if (value.schemaVersion !== SCHOOL_OFFLINE_SCHEMA_VERSION) return false;
  if (!isNonEmptyString(value.schoolId)) return false;
  if (!isNonEmptyString(value.schoolSlug)) return false;
  if (!isNonEmptyString(value.syncedAt)) return false;
  if (!isRecord(value.data)) return false;
  const data = value.data;

  if (!isRecord(data.school)) return false;
  if (data.school.id !== value.schoolId) return false;
  if (data.school.subdomain !== value.schoolSlug) return false;

  return [
    "schedules",
    "periods",
    "calendarDays",
    "announcements",
    "events",
    "resources",
    "sports",
    "teams",
    "games",
  ].every((key) => Array.isArray(data[key]));
}

export function assertValidSchoolOfflineSnapshot(
  snapshot: unknown
): asserts snapshot is SchoolOfflineSnapshot {
  if (!isValidSchoolOfflineSnapshot(snapshot)) {
    throw new Error("Invalid offline school snapshot");
  }
}

export function shouldUseSnapshotForSchool(
  snapshot: SchoolOfflineSnapshot | null,
  schoolId: string
) {
  return Boolean(snapshot && snapshot.schoolId === schoolId);
}
