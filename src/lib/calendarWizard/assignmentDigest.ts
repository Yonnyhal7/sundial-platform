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
  return days.map((day) => ({
    date: day.date,
    isSchoolDay: day.isSchoolDay,
    finalScheduleCanonicalKey: day.scheduleId
      ? canonicalScheduleName(scheduleNameForId(day.scheduleId) || day.scheduleId)
      : null,
  }));
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
