import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PdfjsWorkerResolutionError,
  loadPdfjsWorkerDataUrlForRuntime,
} from "./pdfjsWorker.server";

describe("PDF.js runtime worker resolution", () => {
  it("rejects a numeric bundled module reference before calling filesystem APIs", async () => {
    const readWorkerSource = vi.fn();
    await expect(loadPdfjsWorkerDataUrlForRuntime({
      resolveWorkerPath: () => 65956,
      readWorkerSource,
      useCache: false,
    })).rejects.toBeInstanceOf(PdfjsWorkerResolutionError);
    expect(readWorkerSource).not.toHaveBeenCalled();
  });

  it("resolves and reads the installed worker as a runtime filesystem path", async () => {
    const dataUrl = await loadPdfjsWorkerDataUrlForRuntime({ useCache: false });
    expect(dataUrl.startsWith("data:text/javascript;base64,")).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(100_000);
  });
});
