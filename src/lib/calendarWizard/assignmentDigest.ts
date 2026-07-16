import { canonicalScheduleName } from "./scheduleIdentity";

export type AssignmentDigestDay = {
  date: string;
  isSchoolDay: boolean;
  scheduleId: string | null;
};

export function buildAssignmentDigestPayload(
  days: AssignmentDigestDay[],
  scheduleNameForId: (scheduleId: string) => string | undefined
) {
  return days
    .filter((day) => day.isSchoolDay)
    .map((day) => ({
      date: day.date,
      isSchoolDay: true,
      finalScheduleCanonicalKey: day.scheduleId
        ? canonicalScheduleName(scheduleNameForId(day.scheduleId) || day.scheduleId)
        : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function findAssignmentDigestDifferences(
  expected: AssignmentDigestDay[],
  actual: AssignmentDigestDay[],
  expectedScheduleNameForId: (scheduleId: string) => string | undefined,
  actualScheduleNameForId: (scheduleId: string) => string | undefined,
  limit = 5
) {
  const expectedByDate = new Map(
    buildAssignmentDigestPayload(expected, expectedScheduleNameForId).map((day) => [day.date, day])
  );
  const actualByDate = new Map(
    buildAssignmentDigestPayload(actual, actualScheduleNameForId).map((day) => [day.date, day])
  );
  return [...new Set([...expectedByDate.keys(), ...actualByDate.keys()])]
    .sort()
    .filter((date) =>
      expectedByDate.get(date)?.finalScheduleCanonicalKey !==
      actualByDate.get(date)?.finalScheduleCanonicalKey
    )
    .slice(0, limit);
}

export async function computeAssignmentDigest(
  days: AssignmentDigestDay[],
  scheduleNameForId: (scheduleId: string) => string | undefined
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(buildAssignmentDigestPayload(days, scheduleNameForId))
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeDatedScheduleAssignmentDigest(assignments: Array<{
  date: string;
  scheduleName: string;
  source: string;
}>) {
  const normalized = assignments
    .map((assignment) => ({
      date: assignment.date,
      finalScheduleCanonicalKey: canonicalScheduleName(assignment.scheduleName),
      assignmentSource: assignment.source,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const bytes = new TextEncoder().encode(JSON.stringify(normalized));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
