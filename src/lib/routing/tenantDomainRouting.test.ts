import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";
import { getTenantAvailability } from "./tenantAvailability";

vi.mock("./tenantAvailability", () => ({
  getTenantAvailability: vi.fn(),
}));

const mockedAvailability = vi.mocked(getTenantAvailability);

function request(host: string, pathname = "/") {
  const protocol = host.includes("localhost") ? "http" : "https";
  return new NextRequest(`${protocol}://${host}${pathname}`, {
    headers: { host },
  });
}

describe("tenant domain routing", () => {
  beforeEach(() => {
    mockedAvailability.mockReset();
    mockedAvailability.mockImplementation(async (school) =>
      school === "jonny-test1" || school === "north"
        ? "available"
        : "unavailable"
    );
  });

  it.each([
    ["/", "/jonny-test1"],
    ["/app", "/jonny-test1/app"],
    ["/kiosk", "/jonny-test1/kiosk"],
  ])("rewrites tenant subdomain %s internally", async (visible, internal) => {
    const response = await proxy(request("jonny-test1.sundialk12.com", visible));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `https://jonny-test1.sundialk12.com${internal}`
    );
  });

  it("preserves query strings in the tenant rewrite", async () => {
    const response = await proxy(
      request("jonny-test1.sundialk12.com", "/kiosk?mode=display")
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://jonny-test1.sundialk12.com/jonny-test1/kiosk?mode=display"
    );
  });

  it.each(["sundialk12.com", "www.sundialk12.com"])(
    "permanently redirects legacy paths on %s",
    async (host) => {
      const response = await proxy(
        request(host, "/jonny-test1/kiosk?mode=display")
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://jonny-test1.sundialk12.com/kiosk?mode=display"
      );
    }
  );

  it.each([
    "/admin",
    "/api/health",
    "/auth/callback",
    "/invitations",
    "/login",
    "/dashboard",
    "/_next/data/build.json",
  ])("does not treat reserved path %s as a tenant", async (pathname) => {
    const response = await proxy(request("www.sundialk12.com", pathname));
    expect(response.headers.get("location")).toBeNull();
    expect(mockedAvailability).not.toHaveBeenCalled();
  });

  it("preserves admin subdomain behavior", async () => {
    const response = await proxy(request("admin.sundialk12.com", "/dashboard"));
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://admin.sundialk12.com/admin/dashboard"
    );
    expect(mockedAvailability).not.toHaveBeenCalled();
  });

  it("serves the production user directory through the internal admin route", async () => {
    const response = await proxy(request("admin.sundialk12.com", "/dashboard/users"));
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://admin.sundialk12.com/admin/dashboard/users"
    );
    expect(mockedAvailability).not.toHaveBeenCalled();
  });

  it("exposes recovery routes on the production admin host", async () => {
    const forgot = await proxy(request("admin.sundialk12.com", "/forgot-password"));
    expect(forgot.headers.get("x-middleware-rewrite")).toBe("https://admin.sundialk12.com/admin/forgot-password");
    const recovery = await proxy(request("admin.sundialk12.com", "/auth/recovery?returnTo=%2Fnorth%2Flogin"));
    expect(recovery.status).toBe(200);
    expect(recovery.headers.get("location")).toBeNull();
  });

  it.each(["unknown-school", "archived-school", "deleted-school"])(
    "does not redirect unavailable legacy tenant %s",
    async (school) => {
      const response = await proxy(request("www.sundialk12.com", `/${school}`));
      expect(response.headers.get("location")).toBeNull();
    }
  );

  it("keeps plain localhost path routing and supports validated localhost aliases", async () => {
    const pathResponse = await proxy(request("localhost:3000", "/jonny-test1/app"));
    expect(pathResponse.headers.get("location")).toBeNull();
    expect(pathResponse.headers.get("x-middleware-rewrite")).toBeNull();

    const aliasResponse = await proxy(request("jonny-test1.localhost:3000", "/app"));
    expect(aliasResponse.headers.get("x-middleware-rewrite")).toBe(
      "http://jonny-test1.localhost:3000/jonny-test1/app"
    );
  });

  it("does not canonicalize paths on Vercel preview hosts", async () => {
    const response = await proxy(
      request("sundial-platform-git-routing-example.vercel.app", "/jonny-test1/app")
    );
    expect(response.headers.get("location")).toBeNull();
    expect(mockedAvailability).not.toHaveBeenCalled();
  });

  it("removes an exposed duplicate tenant prefix without looping", async () => {
    const first = await proxy(
      request("jonny-test1.sundialk12.com", "/jonny-test1/app?tab=today")
    );
    expect(first.status).toBe(308);
    expect(first.headers.get("location")).toBe(
      "https://jonny-test1.sundialk12.com/app?tab=today"
    );

    const canonical = await proxy(request("jonny-test1.sundialk12.com", "/app?tab=today"));
    expect(canonical.status).toBe(200);
    expect(canonical.headers.get("location")).toBeNull();
  });

  it("keeps tenant rewrites isolated to the hostname tenant", async () => {
    const response = await proxy(request("north.sundialk12.com", "/app"));
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://north.sundialk12.com/north/app"
    );
    expect(response.headers.get("x-middleware-rewrite")).not.toContain("jonny-test1");
  });

  it("keeps the visible tenant App URL at /app without redirecting to the website root", async () => {
    const response = await proxy(
      request("jonny-test1.sundialk12.com", "/app")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://jonny-test1.sundialk12.com/jonny-test1/app"
    );
  });
});
