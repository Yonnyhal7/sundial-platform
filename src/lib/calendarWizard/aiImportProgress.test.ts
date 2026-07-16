import { describe, expect, it } from "vitest";
import {
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
    expect(getAiImportStageDetails("checking_cache").progress).toBe(20);
    expect(getAiImportStageDetails("falling_back_to_pdf").progress).toBe(68);
    expect(getAiImportStageDetails("saving_result").progress).toBe(96);
    expect(getAiImportStageDetails("ready").progress).toBe(100);
  });

  it("validates server stage strings", () => {
    expect(isAiImportServerStage("upload_received")).toBe(true);
    expect(isAiImportServerStage("waiting_at_fake_94_percent")).toBe(false);
  });
});
