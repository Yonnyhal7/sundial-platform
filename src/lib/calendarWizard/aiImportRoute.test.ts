import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSchoolForSetup: vi.fn(),
  canAccessAdminSection: vi.fn(),
  analyzeCalendarPdf: vi.fn(),
  readCalendarAnalysisAttemptResult: vi.fn(),
  readCalendarAnalysisStage: vi.fn(),
  writeCalendarAnalysisAttemptResult: vi.fn(),
  hasPendingCalendarAnalysis: vi.fn(),
  getCalendarAnalysisFailure: vi.fn(),
  getCalendarAnalysisStage: vi.fn(),
  markStaleCalendarAnalysisIfNeeded: vi.fn(),
  recordCalendarAnalysisFailure: vi.fn(),
  setCalendarAnalysisStage: vi.fn(),
  claimCalendarAnalysisAttempt: vi.fn(),
  validateCalendarPdfFile: vi.fn(),
}));

vi.mock("@/lib/schools", () => ({
  getSchoolForSetup: mocks.getSchoolForSetup,
}));

vi.mock("@/lib/auth/adminPermissions", () => ({
  canAccessAdminSection: mocks.canAccessAdminSection,
}));

vi.mock("@/lib/calendarWizard/openAiCalendarAnalyzer.server", () => ({
  analyzeCalendarPdf: mocks.analyzeCalendarPdf,
}));

vi.mock("@/lib/calendarWizard/aiPdfValidation", () => ({
  validateCalendarPdfFile: mocks.validateCalendarPdfFile,
}));

vi.mock("@/lib/calendarWizard/aiCalendarAnalysisCache.server", () => ({
  AI_CALENDAR_PROMPT_SCHEMA_VERSION: "calendar-v3",
  AI_CALENDAR_PDF_STRATEGY: "pdf-gpt5",
  AI_CALENDAR_TEXT_STRATEGY: "text-gpt5-mini",
  AI_CALENDAR_STALE_DEADLINE_GRACE_MS: 15_000,
  readCalendarAnalysisAttemptResult: mocks.readCalendarAnalysisAttemptResult,
  readCalendarAnalysisStage: mocks.readCalendarAnalysisStage,
  writeCalendarAnalysisAttemptResult: mocks.writeCalendarAnalysisAttemptResult,
  hasPendingCalendarAnalysis: mocks.hasPendingCalendarAnalysis,
  getCalendarAnalysisFailure: mocks.getCalendarAnalysisFailure,
  getCalendarAnalysisStage: mocks.getCalendarAnalysisStage,
  markStaleCalendarAnalysisIfNeeded: mocks.markStaleCalendarAnalysisIfNeeded,
  recordCalendarAnalysisFailure: mocks.recordCalendarAnalysisFailure,
  setCalendarAnalysisStage: mocks.setCalendarAnalysisStage,
  claimCalendarAnalysisAttempt: mocks.claimCalendarAnalysisAttempt,
  dedupeCalendarAnalysis: (_key: unknown, analyze: () => Promise<unknown>) => analyze(),
}));

import { POST, maxDuration } from "@/app/api/admin/[school]/calendar/ai-import/route";
import { GET as GET_RESULT } from "@/app/api/admin/[school]/calendar/ai-import/result/route";
import { GET as GET_STATUS } from "@/app/api/admin/[school]/calendar/ai-import/status/route";

function pdfFile(bytes = "%PDF-1.7\ncalendar") {
  return new File([bytes], "calendar.pdf", { type: "application/pdf" });
}

function requestWithFile(file: File | Blob | string) {
  const formData = new FormData();
  formData.set("calendarPdf", file);
  return new Request("https://www.sundialk12.com/api/admin/test/calendar/ai-import", {
    method: "POST",
    body: formData,
  });
}

function requestWithAttempt(file: File | Blob | string, attemptId: string) {
  const formData = new FormData();
  formData.set("calendarPdf", file);
  formData.set("analysisAttemptId", attemptId);

  return new Request("https://www.sundialk12.com/api/admin/test/calendar/ai-import", {
    method: "POST",
    body: formData,
  });
}

async function post(file: File | Blob | string = pdfFile()) {
  return POST(requestWithFile(file), { params: Promise.resolve({ school: "test" }) });
}

describe("AI import API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSchoolForSetup.mockResolvedValue({ id: "school-1", subdomain: "test" });
    mocks.canAccessAdminSection.mockResolvedValue(true);
    mocks.readCalendarAnalysisAttemptResult.mockResolvedValue(null);
    mocks.readCalendarAnalysisStage.mockResolvedValue(null);
    mocks.hasPendingCalendarAnalysis.mockReturnValue(false);
    mocks.getCalendarAnalysisFailure.mockReturnValue(null);
    mocks.getCalendarAnalysisStage.mockReturnValue(null);
    mocks.markStaleCalendarAnalysisIfNeeded.mockResolvedValue(null);
    mocks.claimCalendarAnalysisAttempt.mockResolvedValue(true);
    mocks.validateCalendarPdfFile.mockResolvedValue({ valid: true });
    mocks.analyzeCalendarPdf.mockResolvedValue({
      status: "success",
      importResult: createMockAiCalendarImportResult(),
    });
  });

  it("allows the server enough time for PDF vision analysis", () => {
    expect(maxDuration).toBe(300);
  });

  it("returns a successful import result", async () => {
    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "success" });
    expect(response.headers.get("x-sundial-ai-import-request-id")).toBeTruthy();
    expect(mocks.analyzeCalendarPdf).toHaveBeenCalledOnce();
  });

  it("uses the client analysis attempt id for stage updates and the response header", async () => {
    const attemptId = "11111111-1111-4111-8111-111111111111";
    const response = await POST(
      requestWithAttempt(pdfFile(), attemptId),
      { params: Promise.resolve({ school: "test" }) }
    );

    expect(response.headers.get("x-sundial-ai-import-request-id")).not.toBe(attemptId);
    expect(response.headers.get("x-sundial-ai-import-attempt-id")).toBe(attemptId);
    expect(mocks.setCalendarAnalysisStage).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: "school-1" }),
      "upload_received",
      expect.objectContaining({ analysisAttemptId: attemptId })
    );
    expect(mocks.setCalendarAnalysisStage).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: "school-1" }),
      "validating_pdf",
      expect.objectContaining({ analysisAttemptId: attemptId })
    );
  });

  it("recovers an exact completed attempt on a transport retry without another analysis", async () => {
    const attemptId = "11111111-1111-4111-8111-111111111111";
    mocks.readCalendarAnalysisAttemptResult.mockResolvedValueOnce({
      result: createMockAiCalendarImportResult(),
      createdAt: new Date().toISOString(),
      strategy: "pdf-gpt5",
      model: "gpt-5.6-sol",
      version: "calendar-v3",
      analyzerVersion: "calendar-v3",
    });

    const response = await POST(requestWithAttempt(pdfFile(), attemptId), {
      params: Promise.resolve({ school: "test" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.analyzeCalendarPdf).not.toHaveBeenCalled();
    expect(mocks.claimCalendarAnalysisAttempt).not.toHaveBeenCalled();
  });

  it("always analyzes the same completed PDF again without a reusable-result read", async () => {
    await post();
    await post();

    expect(mocks.analyzeCalendarPdf).toHaveBeenCalledTimes(2);
    expect(mocks.readCalendarAnalysisAttemptResult).not.toHaveBeenCalled();
  });

  it("prevents a concurrent duplicate attempt from starting another analysis", async () => {
    mocks.claimCalendarAnalysisAttempt.mockResolvedValue(false);

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ reasonCode: "analysis_attempt_superseded" });
    expect(mocks.analyzeCalendarPdf).not.toHaveBeenCalled();
  });

  it("persists successful fast text results only for attempt recovery", async () => {
    mocks.analyzeCalendarPdf.mockResolvedValue({
      status: "success",
      importResult: createMockAiCalendarImportResult(),
      analysisStrategy: "text-gpt5-mini",
    });

    const response = await post();

    expect(response.status).toBe(200);
    expect(mocks.writeCalendarAnalysisAttemptResult).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "text-gpt5-mini" }),
      expect.any(Object),
      expect.any(String)
    );
  });

  it("returns configuration errors distinctly for a missing OpenAI API key", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.analyzeCalendarPdf.mockResolvedValue({
      status: "configuration_error",
      message: "AI calendar import is not enabled in this environment. Ask an administrator to add the OpenAI API key and retry.",
      reasonCode: "missing_openai_api_key",
    });

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "configuration_error",
      reasonCode: "missing_openai_api_key",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "AI calendar import route diagnostic",
      expect.objectContaining({
        event: "analysis_finished",
        status: "configuration_error",
        reasonCode: "missing_openai_api_key",
      })
    );
    warnSpy.mockRestore();
  });

  it("returns timeout analysis failures distinctly", async () => {
    mocks.analyzeCalendarPdf.mockResolvedValue({
      status: "analysis_failed",
      message: "The calendar analysis took too long to complete. Retry, or continue manually.",
      reasonCode: "openai_timeout",
      retryable: true,
    });

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      reasonCode: "openai_timeout",
      retryable: true,
    });
    expect(mocks.recordCalendarAnalysisFailure).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: "school-1" }),
      "openai_timeout",
      expect.any(String)
    );
  });

  it("returns malformed AI response failures distinctly", async () => {
    mocks.analyzeCalendarPdf.mockResolvedValue({
      status: "analysis_failed",
      message: "Sundial read the PDF, but the AI response did not match the calendar format we need. Try again or continue manually.",
    });

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toContain("AI response");
  });

  it("rejects unsupported file uploads before analysis", async () => {
    mocks.validateCalendarPdfFile.mockResolvedValue({
      valid: false,
      message: "Please upload a PDF calendar smaller than 20 MB.",
    });
    const response = await post(new File(["hello"], "calendar.txt", { type: "text/plain" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ status: "validation_error" });
    expect(mocks.analyzeCalendarPdf).not.toHaveBeenCalled();
  });

  it("rejects non-PDF bytes before analysis", async () => {
    mocks.validateCalendarPdfFile.mockResolvedValue({
      valid: false,
      message: "This file does not appear to be a valid PDF.",
    });
    const response = await post(new File(["not a pdf"], "calendar.pdf", { type: "application/pdf" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toContain("valid PDF");
    expect(mocks.analyzeCalendarPdf).not.toHaveBeenCalled();
  });

  it("rejects oversized PDFs before analysis", async () => {
    mocks.validateCalendarPdfFile.mockResolvedValue({
      valid: false,
      message: "Please upload a PDF calendar smaller than 20 MB.",
    });
    const oversized = new File(
      [new Uint8Array(20 * 1024 * 1024 + 1)],
      "calendar.pdf",
      { type: "application/pdf" }
    );

    const response = await post(oversized);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toContain("smaller than 20 MB");
    expect(mocks.analyzeCalendarPdf).not.toHaveBeenCalled();
  });

  it("reports the initiating attempt result as ready during status polling", async () => {
    mocks.readCalendarAnalysisAttemptResult.mockResolvedValue({
      result: createMockAiCalendarImportResult(),
      createdAt: new Date().toISOString(),
    });

    const response = await GET_STATUS(
      new Request("https://www.sundialk12.com/api/admin/test/calendar/ai-import/status?pdfHash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&attemptId=11111111-1111-4111-8111-111111111111"),
      { params: Promise.resolve({ school: "test" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ready",
      resultId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      stage: "ready",
    });
  });

  it("reports pending when an identical analysis is still running", async () => {
    mocks.hasPendingCalendarAnalysis.mockReturnValue(true);
    mocks.getCalendarAnalysisStage.mockReturnValue({
      stage: "analyzing_text",
      strategy: "text-gpt5-mini",
      updatedAt: Date.now(),
    });

    const response = await GET_STATUS(
      new Request("https://www.sundialk12.com/api/admin/test/calendar/ai-import/status?pdfHash=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&attemptId=11111111-1111-4111-8111-111111111111"),
      { params: Promise.resolve({ school: "test" }) }
    );
    const body = await response.json();

    expect(body).toMatchObject({
      status: "pending",
      stage: "analyzing_text",
      strategy: "text-gpt5-mini",
    });
  });

  it("reports a persisted pending stage when the in-memory request state is gone", async () => {
    mocks.readCalendarAnalysisStage.mockResolvedValue({
      status: "pending",
      stage: "analyzing_pdf",
      strategy: "pdf-gpt5",
      updatedAt: Date.now(),
    });

    const response = await GET_STATUS(
      new Request("https://www.sundialk12.com/api/admin/test/calendar/ai-import/status?pdfHash=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&attemptId=11111111-1111-4111-8111-111111111111"),
      { params: Promise.resolve({ school: "test" }) }
    );
    const body = await response.json();

    expect(body).toMatchObject({
      status: "pending",
      stage: "analyzing_pdf",
      strategy: "pdf-gpt5",
    });
  });

  it("marks stale pending jobs as failed during status polling", async () => {
    mocks.markStaleCalendarAnalysisIfNeeded.mockResolvedValue({
      status: "failed",
      stage: "confirmed_failed",
      strategy: "pdf-gpt5",
      reasonCode: "analysis_job_stale",
      updatedAt: Date.now(),
    });

    const response = await GET_STATUS(
      new Request("https://www.sundialk12.com/api/admin/test/calendar/ai-import/status?pdfHash=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&attemptId=11111111-1111-4111-8111-111111111111"),
      { params: Promise.resolve({ school: "test" }) }
    );
    const body = await response.json();

    expect(body).toMatchObject({
      status: "failed",
      reasonCode: "analysis_job_stale",
      stage: "confirmed_failed",
      strategy: "pdf-gpt5",
    });
  });

  it("treats missing active state beyond the server deadline as stale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:05:00.000Z"));

    const response = await GET_STATUS(
      new Request("https://www.sundialk12.com/api/admin/test/calendar/ai-import/status?pdfHash=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&startedAt=1784160000000&attemptId=11111111-1111-4111-8111-111111111111"),
      { params: Promise.resolve({ school: "test" }) }
    );
    const body = await response.json();

    expect(body).toEqual({
      status: "failed",
      reasonCode: "analysis_job_stale",
      stage: "confirmed_failed",
    });
    vi.useRealTimers();
  });

  it("reports confirmed failures from the server status path", async () => {
    mocks.getCalendarAnalysisFailure.mockReturnValue({
      reasonCode: "schema_validation_failed",
      failedAt: Date.now(),
    });

    const response = await GET_STATUS(
      new Request("https://www.sundialk12.com/api/admin/test/calendar/ai-import/status?pdfHash=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc&attemptId=11111111-1111-4111-8111-111111111111"),
      { params: Promise.resolve({ school: "test" }) }
    );
    const body = await response.json();

    expect(body).toEqual({
      status: "failed",
      reasonCode: "schema_validation_failed",
      stage: "confirmed_failed",
    });
  });

  it("returns an attempt-scoped recovery result through the tenant-checked endpoint", async () => {
    const importResult = createMockAiCalendarImportResult();
    mocks.readCalendarAnalysisAttemptResult.mockResolvedValue({
      result: importResult,
      createdAt: "2026-07-16T12:00:00.000Z",
      strategy: "pdf-gpt5",
      model: "gpt-5",
      version: "calendar-v3",
      analyzerVersion: "calendar-v3",
    });

    const response = await GET_RESULT(
      new Request("https://www.sundialk12.com/api/admin/test/calendar/ai-import/result?pdfHash=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd&attemptId=11111111-1111-4111-8111-111111111111"),
      { params: Promise.resolve({ school: "test" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "success",
      importResult,
    });
    expect(body).not.toHaveProperty("cache");
  });

  it("enforces tenant permissions for status lookups", async () => {
    mocks.canAccessAdminSection.mockResolvedValue(false);

    const response = await GET_STATUS(
      new Request("https://www.sundialk12.com/api/admin/test/calendar/ai-import/status?pdfHash=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&attemptId=11111111-1111-4111-8111-111111111111"),
      { params: Promise.resolve({ school: "test" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      status: "failed",
      reasonCode: "permission_denied",
    });
  });

});
