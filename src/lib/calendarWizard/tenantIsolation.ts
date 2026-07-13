import type { CalendarWizardStoredData } from "./draftPersistence";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function collectStoredDraftScheduleIds(data: CalendarWizardStoredData) {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && UUID_PATTERN.test(value)) ids.add(value);
  };
  const draft = data.draft;

  add(draft.sameScheduleId);
  draft.repeatingScheduleIds.forEach(add);
  Object.values(draft.weekdaySchedules).forEach(add);
  draft.specialDays.forEach((day) => add(day.scheduleId));
  draft.aiImport?.resolutions.forEach((resolution) =>
    add(resolution.matchedExistingScheduleId)
  );

  return [...ids];
}

export function findForeignScheduleIds(
  referencedScheduleIds: Iterable<string>,
  ownedScheduleIds: Iterable<string>
) {
  const owned = new Set(ownedScheduleIds);
  return [...new Set(referencedScheduleIds)].filter((id) => !owned.has(id));
}
