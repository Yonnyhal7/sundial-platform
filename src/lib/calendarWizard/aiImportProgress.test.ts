import { describe, expect, it } from "vitest";
import {
  getAiImportEstimatedProgress,
  getAiImportStageDetails,
  isAiImportServerStage,
} from "./aiImportProgress";

describe("AI import progress stages", () => {
  it("uses indeterminate progress for long OpenAI analysis stages", () => {
    expect(getAiImportStageDetails("analyzing_text")).toMatchObject({
      progress: null,
      indeterminate: true,
    });
    expect(getAiImportStageDetails("analyzing_pdf")).toMatchObject({
      progress: null,
      indeterminate: true,
    });
  });

  it("reports concrete progress only for bounded server stages", () => {
    expect(getAiImportStageDetails("checking_cache").progress).toBe(22);
    expect(getAiImportStageDetails("falling_back_to_pdf").progress).toBe(75);
    expect(getAiImportStageDetails("saving_result").progress).toBe(99);
    expect(getAiImportStageDetails("ready").progress).toBe(100);
  });

  it("validates server stage strings", () => {
    expect(isAiImportServerStage("upload_received")).toBe(true);
    expect(isAiImportServerStage("waiting_at_fake_94_percent")).toBe(false);
  });

  it("estimates long model stages within the stage range", () => {
    const text = getAiImportEstimatedProgress({
      stage: "analyzing_text",
      previousProgress: 35,
      stageStartedAt: 1_000,
      now: 38_500,
      expectedDurationMs: 75_000,
    });
    expect(text).toMatchObject({ estimated: true, indeterminate: false });
    expect(text.progress).toBeGreaterThan(35);
    expect(text.progress).toBeLessThan(65);

    const visual = getAiImportEstimatedProgress({
      stage: "analyzing_pdf",
      previousProgress: 35,
      stageStartedAt: 1_000,
      now: 76_000,
      expectedDurationMs: 150_000,
    });
    expect(visual).toMatchObject({ estimated: true, indeterminate: false });
    expect(visual.progress).toBeGreaterThan(35);
    expect(visual.progress).toBeLessThan(78);
  });

  it("never moves progress backward during text-to-PDF fallback", () => {
    expect(
      getAiImportEstimatedProgress({
        stage: "falling_back_to_pdf",
        previousProgress: 81,
        now: 10_000,
      }).progress
    ).toBe(81);
  });

  it("uses indeterminate progress when a model stage has no timing estimate", () => {
    expect(
      getAiImportEstimatedProgress({
        stage: "analyzing_pdf",
        previousProgress: 42,
        stageStartedAt: null,
      })
    ).toMatchObject({
      progress: 42,
      estimated: false,
      indeterminate: true,
    });
  });
});
