import { describe, expect, it } from "vitest";
import {
  appendCalendarWizardLaunchContext,
  parseCalendarWizardLaunchContext,
} from "./launchContext";

describe("calendar wizard launch context", () => {
  it("accepts only the setup launch context", () => {
    expect(parseCalendarWizardLaunchContext("setup")).toBe("setup");
    expect(parseCalendarWizardLaunchContext("calendar")).toBeNull();
    expect(parseCalendarWizardLaunchContext("https://example.com")).toBeNull();
    expect(parseCalendarWizardLaunchContext(undefined)).toBeNull();
  });

  it("uses the first query value safely", () => {
    expect(parseCalendarWizardLaunchContext(["setup", "other"])).toBe("setup");
    expect(parseCalendarWizardLaunchContext(["other", "setup"])).toBeNull();
  });

  it("appends setup context without accepting return URLs", () => {
    expect(appendCalendarWizardLaunchContext("/deloro/admin/calendar/wizard/ai", "setup")).toBe(
      "/deloro/admin/calendar/wizard/ai?from=setup"
    );
    expect(appendCalendarWizardLaunchContext("/deloro/admin/calendar/wizard/ai?startOver=1", "setup")).toBe(
      "/deloro/admin/calendar/wizard/ai?startOver=1&from=setup"
    );
    expect(appendCalendarWizardLaunchContext("/deloro/admin/calendar/wizard/ai", null)).toBe(
      "/deloro/admin/calendar/wizard/ai"
    );
  });
});
