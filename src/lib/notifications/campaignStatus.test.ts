import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCampaignDeliverySummary,
  getCampaignDisplayStatus,
} from "./campaignStatus";

const completed = {
  status: "sent",
  scheduled_for: null,
  eligible_count: 3,
  successful_count: 3,
  failed_count: 0,
};

describe("notification campaign state", () => {
  it("uses lifecycle state before aggregate state", () => {
    expect(getCampaignDisplayStatus({ ...completed, status: "draft" })).toBe("draft");
    expect(getCampaignDisplayStatus({
      ...completed,
      status: "scheduled",
      scheduled_for: "2030-01-01T00:00:00.000Z",
    }, new Date("2029-01-01T00:00:00.000Z"))).toBe("scheduled");
    expect(getCampaignDisplayStatus({ ...completed, status: "sending" })).toBe("sending");
  });

  it.each([
    [{ ...completed, status: "partially_failed" }, "sent"],
    [{ ...completed, status: "sent", successful_count: 1, failed_count: 2 }, "partially_failed"],
    [{ ...completed, status: "sent", successful_count: 0, failed_count: 3 }, "failed"],
    [{ ...completed, status: "failed", eligible_count: 0, successful_count: 0, failed_count: 3 }, "no_eligible_devices"],
  ])("derives completed state from persisted aggregates", (campaign, expected) => {
    expect(getCampaignDisplayStatus(campaign)).toBe(expected);
  });
});

describe("notification aggregate presentation", () => {
  it("presents successful delivery without a contradictory zero-failure suffix", () => {
    expect(getCampaignDeliverySummary(completed)).toBe("Delivered to 3 devices");
  });

  it("presents partial and zero-eligible outcomes", () => {
    expect(getCampaignDeliverySummary({
      ...completed,
      eligible_count: 5,
      failed_count: 2,
    })).toBe("3 delivered\n2 failed");
    expect(getCampaignDeliverySummary({
      ...completed,
      eligible_count: 0,
      successful_count: 0,
    })).toBe("No eligible devices");
  });
});

describe("notification status migration contract", () => {
  const migration = fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260725130000_notification_no_eligible_status.sql"
    ),
    "utf8"
  );
  const reconciliation = migration.slice(
    migration.indexOf("update public.notification_campaigns")
  );

  it("adds the terminal status with a replay-safe constraint replacement", () => {
    expect(migration).toContain(
      "drop constraint if exists notification_campaigns_status_check"
    );
    expect(migration).toContain("'no_eligible_devices'");
  });

  it("reconciles only mismatched terminal campaign statuses", () => {
    expect(reconciliation).toContain(
      "where status in ('sent', 'partially_failed', 'failed', 'no_eligible_devices')"
    );
    expect(reconciliation).toContain("status is distinct from case");
    expect(reconciliation).not.toContain("'queued'");
    expect(reconciliation).not.toContain("'sending'");
  });

  it("does not mutate deliveries or audit history", () => {
    expect(migration).not.toMatch(
      /(update|insert into|delete from)\s+public\.notification_deliveries/i
    );
    expect(migration).not.toMatch(
      /(update|insert into|delete from)\s+public\.notification_audit/i
    );
  });
});
