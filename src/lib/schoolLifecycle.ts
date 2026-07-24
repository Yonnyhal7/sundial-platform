export type SchoolLifecycleState = {
  status: "idle" | "success" | "error" | "warning";
  message?: string;
  reason?:
    | "client_invocation_failure"
    | "authorization_failure"
    | "validation_failure"
    | "database_failure"
    | "storage_cleanup_failure"
    | "success";
};

export type SchoolDeletionCounts = {
  schedules: number;
  periods: number;
  calendarDays: number;
  users: number;
  drafts: number;
  announcements: number;
  events: number;
  sports: number;
  teams: number;
  games: number;
  resources: number;
  notifications: number;
  analytics: number;
  featureFlags: number;
  schedulePatterns: number;
  invitations: number;
  kioskSettings: number;
  storedFiles: number;
};

export type SchoolStorageObject = {
  bucket: string;
  path: string;
};

export const EMPTY_LIFECYCLE_STATE: SchoolLifecycleState = { status: "idle" };

export function confirmationMatches(
  confirmation: string,
  schoolName: string,
  schoolSubdomain: string,
) {
  const value = confirmation.trim();
  return value === schoolName || value === schoolSubdomain;
}

export function storageObjectFromPublicUrl(
  value: string | null | undefined,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): SchoolStorageObject | null {
  if (!value || !supabaseUrl) return null;

  try {
    const decodedValue = decodeURIComponent(value);
    if (decodedValue.includes("/../") || decodedValue.includes("/./"))
      return null;
    const url = new URL(value);
    const expectedOrigin = new URL(supabaseUrl).origin;
    if (url.origin !== expectedOrigin) return null;

    const marker = "/storage/v1/object/public/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const objectPath = decodeURIComponent(
      url.pathname.slice(markerIndex + marker.length),
    );
    const slashIndex = objectPath.indexOf("/");
    if (slashIndex <= 0 || slashIndex === objectPath.length - 1) return null;

    const bucket = objectPath.slice(0, slashIndex);
    const path = objectPath.slice(slashIndex + 1);
    if (
      path
        .split("/")
        .some((segment) => !segment || segment === "." || segment === "..")
    ) {
      return null;
    }

    return { bucket, path };
  } catch {
    return null;
  }
}

export function isTenantScopedStorageObject(
  object: SchoolStorageObject,
  schoolId: string,
) {
  return (
    (object.bucket === "school-logos" &&
      object.path.startsWith(`schools/${schoolId}/logos/`)) ||
    (object.bucket === "resource-file" &&
      object.path.startsWith(`schools/${schoolId}/resources/`))
  );
}

export function dedupeStorageManifest(objects: SchoolStorageObject[]) {
  return [
    ...new Map(
      objects.map((object) => [`${object.bucket}:${object.path}`, object]),
    ).values(),
  ];
}

export function normalizeDeletionCounts(value: unknown): SchoolDeletionCounts {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const numberValue = (key: string) => {
    const count = Number(input[key] || 0);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  };

  return {
    schedules: numberValue("schedules"),
    periods: numberValue("periods"),
    calendarDays: numberValue("calendarDays"),
    users: numberValue("users"),
    drafts: numberValue("drafts"),
    announcements: numberValue("announcements"),
    events: numberValue("events"),
    sports: numberValue("sports"),
    teams: numberValue("teams"),
    games: numberValue("games"),
    resources: numberValue("resources"),
    notifications: numberValue("notifications"),
    analytics: numberValue("analytics"),
    featureFlags: numberValue("featureFlags"),
    schedulePatterns: numberValue("schedulePatterns"),
    invitations: numberValue("invitations"),
    kioskSettings: numberValue("kioskSettings"),
    storedFiles: numberValue("storedFiles"),
  };
}
