import { describe, expect, it } from "vitest";
import {
  categoryAvailableForAudience,
  getNotificationAudienceLabel,
  getNotificationAudienceListLabel,
  getNotificationCategoryLabel,
  getRecommendedPreferences,
  getZeroRecipientCampaignCompletion,
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
    expect(getNotificationAudienceListLabel(["student", "parent"])).toBe(
      "Student and Parent"
    );
    expect(getNotificationCategoryLabel("closure_delay")).toBe(
      "Closure or Delay"
    );
  });
  it("finalizes a zero-recipient campaign successfully without a delivery attempt", () => {
    const completion = getZeroRecipientCampaignCompletion(
      ["student", "parent"],
      "2026-07-25T17:42:20.000Z"
    );
    expect(completion.campaign).toMatchObject({
      status: "sent",
      eligible_count: 0,
      attempted_count: 0,
      successful_count: 0,
      failed_count: 0,
      disabled_subscription_count: 0,
    });
    expect(completion.audit.summary).toBe(
      "No eligible subscribed devices matched Student and Parent."
    );
    expect(completion.audit.result_status).toBe("success");
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
