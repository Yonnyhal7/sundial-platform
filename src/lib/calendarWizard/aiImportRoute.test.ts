import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";

const mocks = vi.hoisted(() => ({
  getSchoolForSetup: vi.fn(),
  canAccessAdminSection: vi.fn(),
  analyzeCalendarPdf: vi.fn(),
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

import { POST, maxDuration } from "@/app/api/admin/[school]/calendar/ai-import/route";

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

async function post(file: File | Blob | string = pdfFile()) {
  return POST(requestWithFile(file), { params: Promise.resolve({ school: "test" }) });
}

describe("AI import API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSchoolForSetup.mockResolvedValue({ id: "school-1", subdomain: "test" });
    mocks.canAccessAdminSection.mockResolvedValue(true);
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
    expect(mocks.analyzeCalendarPdf).toHaveBeenCalledOnce();
  });

  it("returns configuration errors distinctly for a missing OpenAI API key", async () => {
    mocks.analyzeCalendarPdf.mockResolvedValue({
      status: "configuration_error",
      message: "AI calendar import is not configured yet.",
    });

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: "configuration_error" });
  });

  it("returns timeout analysis failures distinctly", async () => {
    mocks.analyzeCalendarPdf.mockResolvedValue({
      status: "analysis_failed",
      message: "Calendar analysis took longer than expected. Please try again or continue manually.",
    });

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toContain("longer than expected");
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
    const response = await post(new File(["hello"], "calendar.txt", { type: "text/plain" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ status: "validation_error" });
    expect(mocks.analyzeCalendarPdf).not.toHaveBeenCalled();
  });

  it("rejects non-PDF bytes before analysis", async () => {
    const response = await post(new File(["not a pdf"], "calendar.pdf", { type: "application/pdf" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toContain("valid PDF");
    expect(mocks.analyzeCalendarPdf).not.toHaveBeenCalled();
  });

  it("rejects oversized PDFs before analysis", async () => {
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
});
