import { describe, expect, it, vi } from "vitest";
import {
  AI_IMPORT_CLIENT_TIMEOUT_MS,
  AiImportClientTimeoutError,
  createAiImportClientTimeoutController,
  getConfiguredAiImportClientTimeoutMs,
  isRecoverableAiImportInterruption,
  mapAiImportClientError,
  parseAiImportResponse,
  parseAiImportStatusResponse,
} from "./aiImportClient";
import { getAiImportProgressAfterRetry } from "./aiImportProgress";
import {
  DEFAULT_AI_IMPORT_CLIENT_TIMEOUT_MS,
  DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS,
  getAiImportClientTimeoutMs,
} from "./aiImportTimeouts";

function response({
  ok = true,
  status = 200,
  body = "",
}: {
  ok?: boolean;
  status?: number;
  body?: string;
}) {
  return {
    ok,
    status,
    text: async () => body,
  };
}

describe("AI import client response handling", () => {
  it("parses a successful JSON import response", async () => {
    const result = await parseAiImportResponse(
      response({
        body: JSON.stringify({
          status: "success",
          importResult: { schemaVersion: 1 },
        }),
      })
    );

    expect(result).toMatchObject({ status: "success" });
  });

  it("maps platform timeout responses to a retryable safe message", async () => {
    const result = await parseAiImportResponse(
      response({
        ok: false,
        status: 504,
        body: "<html>timeout</html>",
      })
    );

    expect(result).toMatchObject({
      status: "analysis_failed",
      retryable: true,
      reasonCode: "client_timeout",
    });
    if (result.status === "success") throw new Error("Expected failure result");
    expect(result.message).toContain("longer than expected");
  });

  it("maps malformed non-JSON success bodies to a recoverable interruption", async () => {
    const result = await parseAiImportResponse(response({ body: "not json" }));

    expect(result).toMatchObject({
      status: "analysis_failed",
      retryable: true,
      reasonCode: "client_connection_ended",
    });
    if (result.status === "success") throw new Error("Expected failure result");
    expect(isRecoverableAiImportInterruption(result)).toBe(true);
  });

  it("maps browser aborts to the timeout message", () => {
    const result = mapAiImportClientError(new DOMException("aborted", "AbortError"));

    expect(result).toMatchObject({
      status: "analysis_failed",
      retryable: true,
      reasonCode: "client_timeout",
    });
    expect(isRecoverableAiImportInterruption(result)).toBe(true);
  });

  it("maps platform HTML errors to a recoverable polling state", async () => {
    const result = await parseAiImportResponse(
      response({ ok: false, status: 500, body: "<html>FUNCTION_INVOCATION_TIMEOUT</html>" })
    );

    expect(result).toMatchObject({
      status: "analysis_failed",
      reasonCode: "client_connection_ended",
    });
    expect(isRecoverableAiImportInterruption(result)).toBe(true);
  });

  it("parses pending, ready, failed, and malformed status responses safely", async () => {
    await expect(
      parseAiImportStatusResponse(response({ body: JSON.stringify({ status: "pending" }) }))
    ).resolves.toEqual({ status: "pending" });
    await expect(
      parseAiImportStatusResponse(
        response({ body: JSON.stringify({ status: "ready", resultId: "hash" }) })
      )
    ).resolves.toEqual({ status: "ready", resultId: "hash" });
    await expect(
      parseAiImportStatusResponse(
        response({ body: JSON.stringify({ status: "failed", reasonCode: "bad" }) })
      )
    ).resolves.toEqual({ status: "failed", reasonCode: "bad" });
    await expect(
      parseAiImportStatusResponse(response({ ok: false, status: 502, body: "<html />" }))
    ).resolves.toEqual({ status: "pending" });
  });

  it("parses server-reported import stages from status polling", async () => {
    await expect(
      parseAiImportStatusResponse(
        response({
          body: JSON.stringify({
            status: "pending",
            stage: "analyzing_pdf",
            strategy: "pdf-gpt5",
          }),
        })
      )
    ).resolves.toEqual({
      status: "pending",
      stage: "analyzing_pdf",
      strategy: "pdf-gpt5",
    });

    await expect(
      parseAiImportStatusResponse(
        response({
          body: JSON.stringify({
            status: "pending",
            stage: "not_a_real_stage",
          }),
        })
      )
    ).resolves.toEqual({ status: "pending" });
  });

  it("allows retry after failure to reset progress", () => {
    expect(getAiImportProgressAfterRetry()).toBe(0);
  });

  it("aborts the browser request at the configured client timeout", () => {
    vi.useFakeTimers();
    const timeout = createAiImportClientTimeoutController(5_000);

    expect(timeout.controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(5_000);

    expect(timeout.controller.signal.aborted).toBe(true);
    expect(timeout.controller.signal.reason).toBeInstanceOf(AiImportClientTimeoutError);
    timeout.clear();
    vi.useRealTimers();
  });

  it("uses a 210-second default client timeout", () => {
    expect(DEFAULT_AI_IMPORT_CLIENT_TIMEOUT_MS).toBe(210_000);
    expect(AI_IMPORT_CLIENT_TIMEOUT_MS).toBe(210_000);
  });

  it("keeps the client timeout longer than the analyzer timeout", () => {
    expect(DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS).toBe(180_000);
    expect(AI_IMPORT_CLIENT_TIMEOUT_MS).toBeGreaterThan(
      DEFAULT_OPENAI_CALENDAR_TIMEOUT_MS
    );
    expect(getAiImportClientTimeoutMs(180_000)).toBe(210_000);
    expect(getAiImportClientTimeoutMs(240_000)).toBe(270_000);
  });

  it("does not abort a 143-second analysis", () => {
    vi.useFakeTimers();
    const timeout = createAiImportClientTimeoutController();

    vi.advanceTimersByTime(143_000);

    expect(timeout.controller.signal.aborted).toBe(false);
    timeout.clear();
    vi.useRealTimers();
  });

  it("aborts a genuinely stuck browser request at the 210-second client timeout", () => {
    vi.useFakeTimers();
    const timeout = createAiImportClientTimeoutController();

    vi.advanceTimersByTime(209_999);
    expect(timeout.controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);

    expect(timeout.controller.signal.aborted).toBe(true);
    expect(timeout.controller.signal.reason).toBeInstanceOf(
      AiImportClientTimeoutError
    );
    timeout.clear();
    vi.useRealTimers();
  });

  it("accepts a successful late response before the client timeout", async () => {
    vi.useFakeTimers();
    const timeout = createAiImportClientTimeoutController();

    vi.advanceTimersByTime(143_000);
    const result = await parseAiImportResponse(
      response({
        body: JSON.stringify({
          status: "success",
          importResult: { schemaVersion: 1 },
        }),
      })
    );

    expect(timeout.controller.signal.aborted).toBe(false);
    expect(result).toMatchObject({ status: "success" });
    timeout.clear();
    vi.useRealTimers();
  });

  it("derives the client timeout from a configured analyzer timeout plus buffer", () => {
    vi.stubEnv("NEXT_PUBLIC_OPENAI_CALENDAR_TIMEOUT_MS", "240000");

    expect(getConfiguredAiImportClientTimeoutMs()).toBe(270_000);

    vi.unstubAllEnvs();
  });

  it("does not read the server-only analyzer timeout in client timeout code", () => {
    vi.stubEnv("OPENAI_CALENDAR_TIMEOUT_MS", "240000");
    vi.stubEnv("NEXT_PUBLIC_OPENAI_CALENDAR_TIMEOUT_MS", undefined);

    expect(getConfiguredAiImportClientTimeoutMs()).toBe(210_000);

    vi.unstubAllEnvs();
  });
});
