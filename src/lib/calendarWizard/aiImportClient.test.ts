import { describe, expect, it, vi } from "vitest";
import {
  AiImportClientTimeoutError,
  createAiImportClientTimeoutController,
  mapAiImportClientError,
  parseAiImportResponse,
} from "./aiImportClient";
import { getAiImportProgressAfterRetry } from "./aiImportProgress";

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
    });
    if (result.status === "success") throw new Error("Expected failure result");
    expect(result.message).toContain("longer than expected");
  });

  it("maps malformed non-JSON success bodies to a retryable response-read error", async () => {
    const result = await parseAiImportResponse(response({ body: "not json" }));

    expect(result).toMatchObject({
      status: "server_error",
      retryable: true,
    });
    if (result.status === "success") throw new Error("Expected failure result");
    expect(result.message).toContain("analysis response");
  });

  it("maps browser aborts to the timeout message", () => {
    const result = mapAiImportClientError(new DOMException("aborted", "AbortError"));

    expect(result).toMatchObject({
      status: "analysis_failed",
      retryable: true,
    });
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
});
