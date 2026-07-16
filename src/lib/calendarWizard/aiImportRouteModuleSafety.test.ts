import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("AI import route module safety", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("imports the route without initializing pdf-parse or canvas", async () => {
    vi.doMock("pdf-parse/worker", () => {
      throw new Error("worker should not load at route import time");
    });
    vi.doMock("pdf-parse", () => {
      throw new Error("pdf-parse should not load at route import time");
    });

    const route = await import("@/app/api/admin/[school]/calendar/ai-import/route");

    expect(route.runtime).toBe("nodejs");
    expect(route.maxDuration).toBe(300);
    expect(typeof route.POST).toBe("function");
  });
});
