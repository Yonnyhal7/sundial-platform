import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSchoolForSetup } = vi.hoisted(() => ({
  getSchoolForSetup: vi.fn(),
}));

vi.mock("@/lib/schools", () => ({ getSchoolForSetup }));

import { GET } from "./route";
import { SUNDIAL_FAVICON_PATH } from "@/lib/tenantFavicon";

function request() {
  return new NextRequest(
    "https://deloro.sundialk12.com/api/schools/deloro/tab-icon"
  );
}

function pngBytes() {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  return bytes;
}

describe("tenant favicon route", () => {
  beforeEach(() => {
    getSchoolForSetup.mockReset();
    vi.restoreAllMocks();
  });

  it("returns an accepted uploaded school logo without exposing its URL", async () => {
    getSchoolForSetup.mockResolvedValue({
      logo_url: "https://assets.example.com/deloro.png",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(pngBytes(), {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    );

    const response = await GET(request(), {
      params: Promise.resolve({ school: "deloro" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("location")).toBeNull();
    expect((await response.arrayBuffer()).byteLength).toBe(
      pngBytes().byteLength
    );
  });

  it.each([
    ["missing school", null],
    ["school without logo", { logo_url: null }],
  ])("falls back for %s", async (_label, schoolData) => {
    getSchoolForSetup.mockResolvedValue(schoolData);

    const response = await GET(request(), {
      params: Promise.resolve({ school: "deloro" }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://deloro.sundialk12.com${SUNDIAL_FAVICON_PATH}`
    );
  });

  it.each([
    ["a broken response", new Response("missing", { status: 404 })],
    [
      "non-image content",
      new Response("<html>not an icon</html>", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    ],
  ])("falls back when the uploaded logo has %s", async (_label, result) => {
    getSchoolForSetup.mockResolvedValue({
      logo_url: "https://assets.example.com/broken.png",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(result);

    const response = await GET(request(), {
      params: Promise.resolve({ school: "deloro" }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://deloro.sundialk12.com${SUNDIAL_FAVICON_PATH}`
    );
  });

  it("does not fetch private or invalid stored URLs", async () => {
    getSchoolForSetup.mockResolvedValue({
      logo_url: "http://127.0.0.1/internal.png",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await GET(request(), {
      params: Promise.resolve({ school: "deloro" }),
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
  });
});
