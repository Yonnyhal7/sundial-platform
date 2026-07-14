import { describe, expect, it } from "vitest";
import {
  getAdminUtilityPath,
  getSchoolAdminPath,
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
    expect(`${base}/setup/complete`).toBe("/test/admin/setup/complete");
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
        "/admin/test/setup/complete",
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
    ).toBe("/test/admin/setup/complete");
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
      "complete",
    ]) {
      expect(
        getSchoolSetupStepPath(
          "test",
          `/test/dashboard/setup/${step}`,
          "admin.sundialk12.com",
          step
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
});
