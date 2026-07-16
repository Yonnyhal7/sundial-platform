import { describe, expect, it } from "vitest";
import { buildAiPreviewConfig } from "./aiImportPreview";
import { generateSchoolYearCalendar } from "./generateSchoolYearCalendar";
import { clearAiImportMetadata } from "./aiImportConversion";
import { planAiSchedulePersistence } from "./aiQuickSetupPersistence";
import type { AiCalendarImportResult, AiImportDraftMetadata } from "./aiImportTypes";

function importedCalendar(): AiCalendarImportResult {
  return {
    schemaVersion: 1, source: "openai", analyzedAt: "2026-07-16",
    schoolYear: {
      startDate: "2026-08-12", endDate: "2026-08-14",
      operatingWeekdays: [1, 2, 3, 4, 5], confidence: "high",
    },
    detectedSchedules: [
      { tempId: "all", detectedName: "All Periods 1-6", normalizedName: "all periods 1 6", category: "special", confidence: "high", needsSetup: true },
      { tempId: "brown", detectedName: "Brown Day", normalizedName: "brown", category: "rotation", confidence: "high", needsSetup: true },
      { tempId: "gold", detectedName: "Gold Day", normalizedName: "gold", category: "rotation", confidence: "high", needsSetup: true },
    ],
    pattern: { type: "repeating", scheduleTempIds: ["brown", "gold"], confidence: "high" },
    noSchoolRanges: [],
    specialDays: [{
      id: "first", startDate: "2026-08-12", endDate: "2026-08-12",
      label: "All Periods", scheduleTempId: "all", isInstructional: true,
      rotationBehavior: "pause", confidence: "high", assignmentSource: "pdf_vector_fill",
    }],
    informationalDates: [], warnings: [],
  };
}

describe("AI calendar import contamination isolation", () => {
  it("does not seed imported dates from existing calendar_days assignments", () => {
    const existingCalendarDays = [
      { date: "2026-08-12", scheduleId: "old-brown" },
      { date: "2026-08-13", scheduleId: "old-gold" },
    ];
    expect(existingCalendarDays).toHaveLength(2); // Deliberately present but not an import input.
    const generated = generateSchoolYearCalendar(buildAiPreviewConfig(importedCalendar()));
    expect(generated.days.find((day) => day.date === "2026-08-12")?.scheduleId).toBe("all");
    expect(generated.days.find((day) => day.date === "2026-08-13")?.scheduleId).toBe("brown");
  });

  it("may reuse an existing schedule definition without reusing its date assignments", () => {
    const result = importedCalendar();
    const plan = planAiSchedulePersistence({
      importResult: result,
      resolutions: result.detectedSchedules.map((schedule) => ({
        tempId: schedule.tempId, detectedName: schedule.detectedName,
        normalizedName: schedule.normalizedName,
        matchedExistingScheduleId: schedule.tempId === "brown" ? "existing-brown" : null,
        status: schedule.tempId === "brown" ? "matched_automatically" : "needs_times",
        needsSetup: schedule.tempId !== "brown",
      })),
      existingSchedules: [{
        id: "existing-brown", name: "Brown Day", active: true,
        setupStatus: "ready", calendarColor: "#996633",
      }],
    });
    expect(plan.tempToScheduleId.brown).toBe("existing-brown");
    expect(plan.matchedScheduleIds).toContain("existing-brown");
  });

  it("clears a previous AI review before a genuinely fresh upload", () => {
    const staleDraft: { aiImport?: AiImportDraftMetadata | null } = {
      aiImport: { state: "review", result: importedCalendar(), resolutions: [] },
    };
    expect(clearAiImportMetadata(staleDraft).aiImport).toBeNull();
  });
});
