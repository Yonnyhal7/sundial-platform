import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { requireColorRotationFallbackReview } from "./openAiCalendarAnalyzer.server";
import { getUnreviewedRequiredAssignmentDates, updateAiImportPreviewDay } from "./aiImportPreview";
import type { AiCalendarImportResult } from "./aiImportTypes";

function fallbackResult(): AiCalendarImportResult {
  return {
    schemaVersion: 1,
    source: "openai",
    analyzedAt: "2026-07-16",
    schoolYear: {
      startDate: "2026-08-12", endDate: "2026-08-31",
      operatingWeekdays: [1, 2, 3, 4, 5], confidence: "high",
    },
    detectedSchedules: [
      { tempId: "brown", detectedName: "Brown Day", normalizedName: "brown", category: "rotation", confidence: "high", needsSetup: true },
      { tempId: "gold", detectedName: "Gold Day", normalizedName: "gold", category: "rotation", confidence: "high", needsSetup: true },
    ],
    pattern: { type: "repeating", scheduleTempIds: ["brown", "gold"], confidence: "high" },
    noSchoolRanges: [], specialDays: [], informationalDates: [], warnings: [],
  };
}

describe("color rotation deterministic-failure behavior", () => {
  it("does not silently trust GPT rotation assignments or default the first day", () => {
    const result = requireColorRotationFallbackReview(fallbackResult(), ["pdfjs_worker_resolution_failed"]);
    expect(result.firstInstructionalAssignment).toMatchObject({
      date: "2026-08-12", source: "unresolved", scheduleName: null,
    });
    expect(result.pattern.confidence).toBe("review");
    expect(result.assignmentReview?.requiredDates).toHaveLength(10);
    expect(getUnreviewedRequiredAssignmentDates(result)).toHaveLength(10);
    expect(result.deterministicExtraction).toEqual({
      status: "fallback_required", reasonCodes: ["pdfjs_worker_resolution_failed"],
    });
  });

  it("requires each inferred date to be explicitly saved by the administrator", () => {
    const result = requireColorRotationFallbackReview(fallbackResult(), ["vector_failed"]);
    const reviewed = updateAiImportPreviewDay(result, {
      date: "2026-08-12", scheduleTempId: "gold", isSchoolDay: true,
      note: "Verified first day", rotationBehavior: "pause",
    });
    expect(reviewed.specialDays.find((day) => day.startDate === "2026-08-12")).toMatchObject({
      assignmentSource: "administrator", assignmentConfidence: 1, rotationBehavior: "pause",
    });
    expect(getUnreviewedRequiredAssignmentDates(reviewed)).toHaveLength(9);
  });

  it("does not apply rotation review requirements to a non-rotation attendance calendar", () => {
    const ordinary = { ...fallbackResult(), detectedSchedules: fallbackResult().detectedSchedules.slice(0, 1) };
    expect(requireColorRotationFallbackReview(ordinary, ["grid_not_identified"])).toBe(ordinary);
  });
});
