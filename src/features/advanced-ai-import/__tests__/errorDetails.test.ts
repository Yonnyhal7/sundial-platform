import { describe, expect, it } from "vitest";
import { serializeErrorDetails } from "../diagnostics/errorDetails";

describe("rendering error diagnostics", () => {
  it("preserves stack, cause, command, and exit details", () => {
    const cause = Object.assign(new Error("native canvas unavailable"), { code: "MODULE_NOT_FOUND" });
    const error = Object.assign(new Error("renderer failed", { cause }), { command: "renderer --page 1", exitCode: 127, stderr: "not found" });
    const details = serializeErrorDetails(error);
    expect(details).toMatchObject({
      message: "renderer failed",
      cause: { message: "native canvas unavailable", rendererDetails: { code: "MODULE_NOT_FOUND" } },
      rendererDetails: { command: "renderer --page 1", exitCode: 127, stderr: "not found" },
    });
    expect(details.stack).toContain("renderer failed");
  });
});
