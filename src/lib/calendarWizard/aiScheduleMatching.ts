import type {
  AiDetectedSchedule,
  DetectedScheduleResolution,
} from "./aiImportTypes";
import { getAiScheduleDefaultColor, normalizeHexColor } from "@/lib/scheduleColors";
import { canonicalScheduleName, isDefaultScheduleAlias } from "./scheduleIdentity";

export type ExistingScheduleForMatching = {
  id: string;
  name: string;
  type?: string | null;
  calendarColor?: string | null;
};

export function normalizeScheduleNameForMatching(name: string) {
  return isDefaultScheduleAlias(name) ? "regular" : canonicalScheduleName(name);
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

  const resolutions: DetectedScheduleResolution[] = detectedSchedules.map((detectedSchedule) => {
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

    const normalized = normalizeScheduleNameForMatching(
      detectedSchedule.normalizedName || detectedSchedule.detectedName
    );
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
  console.info("AI calendar schedule registry", resolutions.map((resolution) => ({
    source: resolution.tempId.startsWith("pdf-vector-") ? "pdf_vector_legend" : "ai_detected",
    idType: resolution.matchedExistingScheduleId ? "database" : "temporary",
    displayName: resolution.reviewedName || resolution.detectedName,
    canonicalKey: canonicalScheduleName(resolution.reviewedName || resolution.detectedName),
    matchedExistingScheduleId: resolution.matchedExistingScheduleId,
    legendColor: null,
  })));
  return resolutions;
}
