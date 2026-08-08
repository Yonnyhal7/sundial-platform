import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const migration = read(
  "supabase/migrations/20260808120000_period_reminder_notifications.sql",
);
const actions = read("src/app/[school]/admin/notifications/actions.ts");
const settingsPage = read(
  "src/app/[school]/admin/notifications/settings/page.tsx",
);
const service = read("src/lib/notifications/periodReminderService.server.ts");
const cron = read("src/app/api/cron/notifications/route.ts");
const overview = read("src/app/[school]/admin/notifications/page.tsx");
const composer = read("src/components/admin/NotificationComposer.tsx");
const notificationModel = read("src/lib/notifications.ts");
const devicePreference = read("src/components/mobile-app/PeriodReminderPreference.tsx");
const deviceApi = read("src/app/api/schools/[school]/notifications/route.ts");
const periodModel = read("src/lib/notifications/periodReminders.ts");

describe("period reminder settings persistence and authorization", () => {
  it("defaults existing and new schools to period reminders off", () => {
    expect(migration).toContain(
      "period_reminders_enabled boolean not null default false",
    );
  });

  it("persists fixed lead time and selected audiences", () => {
    expect(migration).toContain(
      "period_reminder_minutes_before integer not null default 5",
    );
    expect(actions).toContain("p_period_reminder_audiences: audiences");
    expect(actions).toContain(
      'p_period_reminders_enabled: formData.get("period_reminders_enabled") === "on"',
    );
  });

  it("requires notification-section authorization in both action and database RPC", () => {
    expect(actions).toContain(
      "const { schoolData, admin } = await authorized(school)",
    );
    expect(migration).toContain(
      "current_user_can_manage_school_section(p_school_id,'notifications')",
    );
    expect(migration).toContain(
      "jsonb_build_object('status','permission_error')",
    );
  });

  it("renders Settings UX, preview, audience controls, and next reminder status", () => {
    for (const text of [
      "Period Reminders",
      "Enable period reminders",
      "5 minutes before each period",
      "period_reminder_audiences",
      "Push preview",
      "Next scheduled reminder",
    ]) {
      expect(settingsPage).toContain(text);
    }
  });
});

describe("period reminder dispatcher durability", () => {
  it("runs from the authenticated once-per-minute notification cron", () => {
    expect(cron).toContain("processAutomaticPeriodReminders");
    expect(cron).toContain("requireCronAuthorization");
    expect(cron).toContain("processAutomaticPeriodReminders().catch");
  });

  it("uses a durable school/date/period idempotency constraint", () => {
    expect(migration).toContain(
      "unique(school_id,schedule_date,period_id,lead_time_minutes)",
    );
    expect(service).toContain('code === "23505"');
  });

  it("uses Calendar assignments and stable schedule/period IDs", () => {
    expect(service).toContain('.from("calendar_days")');
    expect(service).toContain('.eq("date", scheduleDate)');
    expect(service).toContain("schedule_id: candidate.scheduleId");
    expect(service).toContain("period_id: candidate.periodId");
  });

  it("writes automated runs and deliveries without creating campaign rows", () => {
    expect(service).toContain('.from("notification_period_reminder_runs")');
    expect(service).toContain(
      '.from("notification_period_reminder_deliveries")',
    );
    expect(service).not.toContain('.from("notification_campaigns")');
    expect(overview).not.toContain("notification_period_reminder_runs");
    expect(composer).not.toContain("period_reminder");
    expect(actions).toContain('category === "period_reminder"');
    expect(notificationModel).not.toContain('["first_period_reminder", "period_change_reminder", "period_reminder"');
  });

  it("uses existing subscription disable behavior for invalid endpoints", () => {
    expect(service).toContain("statusCode === 404 || statusCode === 410");
    expect(service).toContain("disabled_subscription");
  });

  it("leaves the existing manual campaign processor in cron", () => {
    expect(cron).toContain(
      "const processing = await processNotificationQueue()",
    );
  });
});

describe("period reminder device preference", () => {
  it("adds an enabled preference for existing devices and new audience defaults", () => {
    expect(migration).toContain("select school_id,id,'period_reminder',true");
    expect(notificationModel).toContain("period_reminder: true");
  });

  it("lets a device opt out without changing school settings", () => {
    expect(devicePreference).toContain('category: PERIOD_REMINDER_CATEGORY, enabled: next');
    expect(deviceApi).toContain('action === "preferences"');
  });

  it("requires school enablement, selected audience, permission, and subscription", () => {
    expect(deviceApi).toContain("periodRemindersAvailable");
    expect(deviceApi).toContain("settings?.period_reminder_audiences?.includes(ctx.device.audience)");
    expect(periodModel).toContain('device.permission_status === "granted"');
    expect(service).toContain('.is("disabled_at", null)');
  });
});
