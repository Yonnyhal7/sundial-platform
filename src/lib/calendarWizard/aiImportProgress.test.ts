import { describe, expect, it } from "vitest";
import {
  AI_IMPORT_WAITING_THRESHOLD,
  getAiImportLongRunningMessage,
  getAiImportProgressAfterError,
  getAiImportProgressAfterRetry,
  getAiImportProgressAfterSuccess,
  getAiImportStageForProgress,
  getEstimatedAiImportProgress,
} from "./aiImportProgress";

describe("AI import staged progress", () => {
  it("never exceeds the waiting threshold before success", () => {
    expect(getEstimatedAiImportProgress(300, 0)).toBe(AI_IMPORT_WAITING_THRESHOLD);
  });

  it("never moves backward", () => {
    expect(getEstimatedAiImportProgress(1, 70)).toBe(70);
  });

  it("success reaches 100", () => {
    expect(getAiImportProgressAfterSuccess()).toBe(100);
  });

  it("error stops at the current progress", () => {
    expect(getAiImportProgressAfterError(68)).toBe(68);
  });

  it("retry resets progress state", () => {
    expect(getAiImportProgressAfterRetry()).toBe(0);
  });

  it("returns the correct stage for progress ranges", () => {
    expect(getAiImportStageForProgress(8).label).toBe("Uploading PDF");
    expect(getAiImportStageForProgress(34).label).toBe("Detecting school dates");
    expect(getAiImportStageForProgress(68).label).toBe("Finding holidays and special days");
    expect(getAiImportStageForProgress(93).label).toBe("Running final review checks");
  });

  it("changes long-running messages after 30, 60, and 120 seconds", () => {
    expect(getAiImportLongRunningMessage(10)).toContain("keep waiting");
    expect(getAiImportLongRunningMessage(30)).toContain("Detailed calendars");
    expect(getAiImportLongRunningMessage(60)).toContain("longer than usual");
    expect(getAiImportLongRunningMessage(120)).toContain("Complex PDF layouts");
  });
});
