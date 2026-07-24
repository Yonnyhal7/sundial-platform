import { describe, expect, it } from "vitest";
import {
  categoryAvailableForAudience,
  getNotificationAudienceLabel,
  getRecommendedPreferences,
  resolveNotificationAudiences,
  sanitizeNotificationDestination,
  sanitizeNotificationText,
  schoolLocalDateTimeToUtc,
} from "./notifications";

describe("notification contracts", () => {
  it("treats everyone as the three communication audiences", () => {
    expect(resolveNotificationAudiences([], true)).toEqual(["student", "parent", "staff"]);
    expect(resolveNotificationAudiences(["student", "student", "bogus"])).toEqual(["student"]);
  });
  it("keeps preferences device and audience specific", () => {
    expect(getRecommendedPreferences("student").find((row) => row.category === "first_period_reminder")?.enabled).toBe(true);
    expect(getRecommendedPreferences("parent").some((row) => row.category === "first_period_reminder")).toBe(false);
    expect(categoryAvailableForAudience("staff_duty", "student")).toBe(false);
  });
  it("maps persisted device audiences to polished display labels", () => {
    expect(getNotificationAudienceLabel("student")).toBe("Student");
    expect(getNotificationAudienceLabel("staff")).toBe("Staff");
    expect(getNotificationAudienceLabel("parent")).toBe("Parent");
    expect(getNotificationAudienceLabel("SchoolAdmin")).toBeNull();
    expect(getNotificationAudienceLabel("unknown")).toBeNull();
  });
  it("sanitizes text and only accepts tenant-local destinations", () => {
    expect(sanitizeNotificationText("  hi\u0000   there ", 60)).toBe("hi there");
    expect(sanitizeNotificationDestination("/del-oro/app/events", "del-oro")).toBe("/del-oro/app/events");
    expect(sanitizeNotificationDestination("/liberty/app", "del-oro")).toBeNull();
    expect(sanitizeNotificationDestination("/app", "del-oro")).toBeNull();
    expect(sanitizeNotificationDestination("//evil.example", "del-oro")).toBeNull();
  });
  it("converts a school local time to UTC and rejects a DST gap", () => {
    expect(schoolLocalDateTimeToUtc("2026-07-24T09:30", "America/Los_Angeles")?.toISOString()).toBe("2026-07-24T16:30:00.000Z");
    expect(schoolLocalDateTimeToUtc("2026-03-08T02:30", "America/Los_Angeles")).toBeNull();
  });
});
