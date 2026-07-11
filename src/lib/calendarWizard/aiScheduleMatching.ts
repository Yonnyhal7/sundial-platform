import type {
  AiDetectedSchedule,
  DetectedScheduleResolution,
} from "./aiImportTypes";
import { getAiScheduleDefaultColor, normalizeHexColor } from "@/lib/scheduleColors";

export type ExistingScheduleForMatching = {
  id: string;
  name: string;
  type?: string | null;
  calendarColor?: string | null;
};

const scheduleSuffixPattern = /\b(schedule|day)\b/g;

export function normalizeScheduleNameForMatching(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(scheduleSuffixPattern, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchDetectedSchedules(
  detectedSchedules: AiDetectedSchedule[],
  existingSchedules: ExistingScheduleForMatching[],
  existingResolutions: DetectedScheduleResolution[] = []
): DetectedScheduleResolution[] {
  const preserved = new Map(existingResolutions.map((resolution) => [resolution.tempId, resolution]));
  const existingByNormalized = new Map<string, ExistingScheduleForMatching[]>();

  for (const schedule of existingSchedules) {
    const normalized = normalizeScheduleNameForMatching(schedule.name);
    existingByNormalized.set(normalized, [
      ...(existingByNormalized.get(normalized) || []),
      schedule,
    ]);
  }

  return detectedSchedules.map((detectedSchedule) => {
    const previous = preserved.get(detectedSchedule.tempId);
    if (previous?.status === "matched_by_admin" || previous?.status === "ignored") {
      return {
        ...previous,
        detectedName: detectedSchedule.detectedName,
        reviewedName: previous.reviewedName || previous.detectedName || detectedSchedule.detectedName,
        normalizedName: detectedSchedule.normalizedName,
        needsSetup: detectedSchedule.needsSetup,
      };
    }

    const normalized =
      detectedSchedule.normalizedName ||
      normalizeScheduleNameForMatching(detectedSchedule.detectedName);
    const candidates = existingByNormalized.get(normalized) || [];

    if (candidates.length === 1) {
      return {
        tempId: detectedSchedule.tempId,
        detectedName: detectedSchedule.detectedName,
        reviewedName: detectedSchedule.detectedName,
        normalizedName: normalized,
        calendarColor: normalizeHexColor(candidates[0].calendarColor),
        matchedExistingScheduleId: candidates[0].id,
        status: "matched_automatically",
        needsSetup: false,
        setupChoice: "add_later",
      };
    }

    return {
      tempId: detectedSchedule.tempId,
      detectedName: detectedSchedule.detectedName,
      reviewedName: detectedSchedule.detectedName,
      normalizedName: normalized,
      calendarColor:
        normalizeHexColor(previous?.calendarColor) ||
        getAiScheduleDefaultColor(
          detectedSchedules.findIndex((schedule) => schedule.tempId === detectedSchedule.tempId)
        ),
      matchedExistingScheduleId: null,
      status: "needs_times",
      needsSetup: true,
      setupChoice: "add_later",
    };
  });
}
