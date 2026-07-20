import { describe, expect, it } from "vitest";
import {
  getAdminUtilityPath,
  getSchoolAppUrl,
  getSchoolAdminPath,
  getSchoolKioskUrl,
  getSchoolLoginDestination,
  getSchoolSetupPath,
  getSchoolSetupStepPath,
} from "./paths";

describe("admin route path helpers", () => {
  it("uses Welcome as the exact production setup landing", () => {
    expect(
      getSchoolSetupPath(
        "deloro",
        "/deloro/dashboard/setup",
        "admin.sundialk12.com"
      )
    ).toBe("/deloro/dashboard/setup/welcome");
  });

  it("uses Welcome as the exact localhost setup landing", () => {
    expect(
      getSchoolSetupPath("deloro", "/deloro/admin/setup", "localhost")
    ).toBe("/deloro/admin/setup/welcome");
  });

  it("keeps the Welcome landing idempotent to prevent redirect loops", () => {
    expect(
      getSchoolSetupPath(
        "deloro",
        "/deloro/dashboard/setup/welcome",
        "admin.sundialk12.com"
      )
    ).toBe("/deloro/dashboard/setup/welcome");
  });

  it("sends incomplete logins to Welcome and completed logins to the dashboard", () => {
    expect(
      getSchoolLoginDestination(
        "deloro",
        "/deloro/login",
        "admin.sundialk12.com",
        false
      )
    ).toBe("/deloro/dashboard/setup/welcome");
    expect(
      getSchoolLoginDestination(
        "deloro",
        "/deloro/login",
        "admin.sundialk12.com",
        true
      )
    ).toBe("/deloro/dashboard");
    expect(
      getSchoolLoginDestination(
        "deloro",
        "/deloro/login",
        "localhost",
        false
      )
    ).toBe("/deloro/admin/setup/welcome");
  });

  it("keeps school-first setup routes on plain localhost", () => {
    expect(
      getSchoolAdminPath("test", "/test/admin/setup/schedule", "localhost")
    ).toBe("/test/admin");
  });

  it("canonicalizes localhost admin aliases back to school-first routes", () => {
    expect(
      getSchoolAdminPath("test", "/admin/test/setup/schedule", "localhost")
    ).toBe("/test/admin");
  });

  it("keeps client-rendered setup sidebar links school-first on old local aliases", () => {
    const base = getSchoolAdminPath("test", "/admin/test/setup/schedule", "");

    expect(`${base}/setup/schedule`).toBe("/test/admin/setup/schedule");
  });

  it("keeps AI and Guided Back to Setup on the current local school-first route", () => {
    const base = getSchoolAdminPath(
      "test",
      "/test/admin/calendar/wizard/ai",
      "localhost"
    );

    expect(`${base}/setup/schedule`).toBe("/test/admin/setup/schedule");
  });

  it("keeps AI Back to Setup canonical when the current local route is the old alias", () => {
    expect(
      getSchoolSetupStepPath(
        "test",
        "/admin/test/calendar/wizard/ai",
        "localhost",
        "schedule"
      )
    ).toBe("/test/admin/setup/schedule");
  });

  it("keeps Guided Back to Setup canonical when the current local route is the old alias", () => {
    expect(
      getSchoolSetupStepPath(
        "test",
        "/admin/test/calendar/wizard/guided",
        "localhost",
        "schedule"
      )
    ).toBe("/test/admin/setup/schedule");
  });

  it("keeps Finish Later and Launch redirects on school-first local routes", () => {
    const base = getSchoolAdminPath(
      "test",
      "/test/admin/calendar/wizard/guided",
      "localhost"
    );

    expect(`${base}/setup/schedule?saved=1`).toBe(
      "/test/admin/setup/schedule?saved=1"
    );
    expect(
      getSchoolSetupStepPath(
        "test",
        "/test/admin/calendar/wizard/guided",
        "localhost",
        "complete"
      )
    ).toBe("/test/admin/setup/launch");
  });

  it("keeps Finish Later canonical when the current local route is the old alias", () => {
    const setupScheduleHref = getSchoolSetupStepPath(
      "test",
      "/admin/test/calendar/wizard/ai",
      "localhost",
      "schedule"
    );

    expect(`${setupScheduleHref}?saved=1`).toBe(
      "/test/admin/setup/schedule?saved=1"
    );
  });

  it("keeps Launch guard redirects on school-first local routes", () => {
    expect(
      getSchoolSetupStepPath(
        "test",
        "/admin/test/setup/launch",
        "localhost",
        "schedule"
      )
    ).toBe("/test/admin/setup/schedule");
  });

  it("keeps setup completion redirects on school-first local routes", () => {
    expect(
      getSchoolSetupStepPath(
        "test",
        "/admin/test/calendar/wizard/ai",
        "localhost",
        "complete"
      )
    ).toBe("/test/admin/setup/launch");
  });

  it("uses dashboard-style visible routes on the production admin host", () => {
    expect(
      getSchoolAdminPath(
        "deloro",
        "/deloro/dashboard/setup/schedule",
        "admin.sundialk12.com"
      )
    ).toBe("/deloro/dashboard");
  });

  it("uses dashboard-style setup routes on the production admin host", () => {
    expect(
      getSchoolSetupStepPath(
        "test",
        "/test/dashboard/setup/schedule",
        "admin.sundialk12.com",
        "schedule"
      )
    ).toBe("/test/dashboard/setup/schedule");
  });

  it("keeps every explicit setup step independent from the Welcome landing", () => {
    for (const step of [
      "school-profile",
      "appearance",
      "administrators",
      "schedule",
      "launch",
    ]) {
      const requestedStep = step === "launch" ? "complete" : step;
      expect(
        getSchoolSetupStepPath(
          "test",
          `/test/dashboard/setup/${step}`,
          "admin.sundialk12.com",
          requestedStep
        )
      ).toBe(`/test/dashboard/setup/${step}`);
    }
  });

  it("does not generate old localhost admin setup aliases", () => {
    const generatedPaths = [
      getSchoolSetupStepPath(
        "test",
        "/test/admin/setup/schedule",
        "localhost",
        "schedule"
      ),
      getSchoolSetupStepPath(
        "test",
        "/admin/test/setup/schedule",
        "localhost",
        "schedule"
      ),
      getSchoolSetupStepPath(
        "test",
        "/admin/test/calendar/wizard/ai",
        "localhost",
        "schedule"
      ),
      `${getSchoolSetupStepPath(
        "test",
        "/admin/test/calendar/wizard/guided",
        "localhost",
        "schedule"
      )}?saved=1`,
    ];

    expect(generatedPaths).not.toContain("/admin/test/setup/schedule");
    expect(generatedPaths).not.toContain("/admin/test/setup/schedule?saved=1");
  });

  it("keeps global admin utility routes local only under /admin", () => {
    expect(getAdminUtilityPath("/admin/select-school", "localhost", "/select-school")).toBe(
      "/admin/select-school"
    );
    expect(getAdminUtilityPath("/deloro/admin/setup", "localhost", "/select-school")).toBe(
      "/select-school"
    );
  });

  it("builds tenant-scoped public App and Kiosk URLs from the production admin host", () => {
    expect(
      getSchoolAppUrl("deloro", "/deloro/dashboard", "admin.sundialk12.com")
    ).toBe("https://deloro.sundialk12.com/app");
    expect(
      getSchoolKioskUrl("deloro", "/deloro/dashboard", "admin.sundialk12.com")
    ).toBe("https://deloro.sundialk12.com/kiosk");
  });

  it("keeps App and Kiosk shortcuts path-based on localhost", () => {
    expect(getSchoolAppUrl("test", "/test/admin", "localhost:3000")).toBe(
      "/test/app"
    );
    expect(getSchoolKioskUrl("test", "/test/admin", "localhost:3000")).toBe(
      "/test/kiosk"
    );
  });

  it("keeps App and Kiosk shortcuts school-first on the public www host", () => {
    expect(getSchoolAppUrl("deloro", "/deloro/admin", "www.sundialk12.com")).toBe(
      "/deloro/app"
    );
    expect(
      getSchoolKioskUrl("deloro", "/deloro/admin", "www.sundialk12.com")
    ).toBe("/deloro/kiosk");
  });

  it("keeps App and Kiosk shortcuts root-relative on school subdomains", () => {
    expect(getSchoolAppUrl("deloro", "/deloro/admin", "deloro.sundialk12.com")).toBe(
      "/app"
    );
    expect(
      getSchoolKioskUrl("deloro", "/deloro/admin", "deloro.sundialk12.com")
    ).toBe("/kiosk");
  });

  it("does not leak one school's shortcut URLs into another tenant", () => {
    expect(getSchoolAppUrl("north", "/north/admin", "admin.sundialk12.com")).toBe(
      "https://north.sundialk12.com/app"
    );
    expect(getSchoolAppUrl("north", "/north/admin", "admin.sundialk12.com")).not.toContain(
      "deloro"
    );
  });
});
