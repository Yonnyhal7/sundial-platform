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

  const tenantCollectionKeys = [
    "schedules",
    "periods",
    "calendarDays",
    "announcements",
    "events",
    "resources",
    "sports",
    "teams",
    "games",
  ] as const;

  if (!tenantCollectionKeys.every((key) => Array.isArray(data[key]))) {
    return false;
  }

  if (
    !tenantCollectionKeys.every((key) =>
      (data[key] as unknown[]).every(
        (row) => isRecord(row) && row.school_id === value.schoolId
      )
    )
  ) {
    return false;
  }

  const schedules = data.schedules as Array<Record<string, unknown>>;
  const scheduleIds = new Set(
    schedules.filter((row) => isNonEmptyString(row.id)).map((row) => row.id as string)
  );
  if (scheduleIds.size !== schedules.length) return false;

  const periods = data.periods as Array<Record<string, unknown>>;
  if (
    periods.some(
      (row) =>
        !isNonEmptyString(row.schedule_id) ||
        !scheduleIds.has(row.schedule_id)
    )
  ) {
    return false;
  }

  const calendarDays = data.calendarDays as Array<Record<string, unknown>>;
  if (
    calendarDays.some(
      (row) =>
        row.schedule_id !== null &&
        (!isNonEmptyString(row.schedule_id) || !scheduleIds.has(row.schedule_id))
    )
  ) {
    return false;
  }

  const sports = data.sports as Array<Record<string, unknown>>;
  const sportIds = new Set(
    sports.filter((row) => isNonEmptyString(row.id)).map((row) => row.id as string)
  );
  if (sportIds.size !== sports.length) return false;

  const teams = data.teams as Array<Record<string, unknown>>;
  const teamIds = new Set(
    teams.filter((row) => isNonEmptyString(row.id)).map((row) => row.id as string)
  );
  if (teamIds.size !== teams.length) return false;
  if (
    teams.some(
      (row) =>
        row.sport_id !== null &&
        (!isNonEmptyString(row.sport_id) || !sportIds.has(row.sport_id))
    )
  ) {
    return false;
  }

  const games = data.games as Array<Record<string, unknown>>;
  return !games.some(
    (row) =>
      row.team_id !== null &&
      (!isNonEmptyString(row.team_id) || !teamIds.has(row.team_id))
  );
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
