import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const migration = read(
  "supabase/migrations/20260808120000_period_reminder_notifications.sql",
);
const customMessageMigration = read(
  "supabase/migrations/20260808130000_period_reminder_custom_message.sql",
);
const actions = read("src/app/[school]/admin/notifications/actions.ts");
const settingsPage = read(
  "src/app/[school]/admin/notifications/settings/page.tsx",
);
const settingsCard = read(
  "src/components/admin/PeriodReminderSettingsCard.tsx",
);
const statusCard = read("src/components/admin/PeriodReminderStatusCard.tsx");
const dashboard = read(
  "src/components/admin/NotificationCampaignDashboard.tsx",
);
const statusLoader = read(
  "src/lib/notifications/periodReminderStatus.server.ts",
);
const service = read("src/lib/notifications/periodReminderService.server.ts");
const cron = read("src/app/api/cron/notifications/route.ts");
const overview = read("src/app/[school]/admin/notifications/page.tsx");
const composer = read("src/components/admin/NotificationComposer.tsx");
const notificationModel = read("src/lib/notifications.ts");
const devicePreference = read(
  "src/components/mobile-app/PeriodReminderPreference.tsx",
);
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

  it("adds a nullable, length-constrained custom body in a forward migration", () => {
    expect(customMessageMigration).toContain(
      "add column period_reminder_custom_message text",
    );
    expect(customMessageMigration).toContain(
      "length(period_reminder_custom_message)<=160",
    );
    expect(customMessageMigration).toContain(
      "p_period_reminder_custom_message text",
    );
    expect(actions).toContain(
      "p_period_reminder_custom_message: normalizePeriodReminderCustomMessage(",
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
    expect(customMessageMigration).toContain(
      "current_user_can_manage_school_section(p_school_id,'notifications')",
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
      expect(settingsCard).toContain(text);
    }
  });

  it("provides a controlled, capped custom-body preview with blank fallback", () => {
    expect(settingsCard).toContain('name="period_reminder_custom_message"');
    expect(settingsCard).toContain(
      "maxLength={PERIOD_REMINDER_CUSTOM_MESSAGE_MAX_LENGTH}",
    );
    expect(settingsCard).toContain("value={customMessage}");
    expect(settingsCard).toContain(
      "normalizePeriodReminderCustomMessage(customMessage)",
    );
    expect(settingsCard).toContain("{customMessage.length}/");
    expect(settingsCard).toContain("Period 3 starts in 5 minutes");
    expect(settingsCard).toContain("Period 3 begins at 11:20 AM.");
  });
});

describe("period reminder overview status", () => {
  it("renders a slim status card between metrics and campaign tabs", () => {
    expect(overview).toContain("<PeriodReminderStatusCard");
    expect(dashboard).toContain("periodReminderCard: ReactNode");
    expect(dashboard.indexOf("{periodReminderCard}")).toBeGreaterThan(
      dashboard.indexOf("metrics.map"),
    );
    expect(dashboard.indexOf("{periodReminderCard}")).toBeLessThan(
      dashboard.indexOf("nav className"),
    );
  });

  it("shows actual state, audience, fixed timing, next status, and settings link", () => {
    for (const text of [
      "Active",
      "Off",
      "getPeriodReminderAudienceSummary",
      "PERIOD_REMINDER_LEAD_MINUTES",
      "Next:",
      "No upcoming reminder found",
      "Manage",
      "Set up",
      "settingsHref",
    ]) {
      expect(statusCard).toContain(text);
    }
  });

  it("shares one tenant-scoped next-reminder loader across Overview and Settings", () => {
    expect(overview).toContain("getPeriodReminderAdminStatus");
    expect(settingsPage).toContain("getPeriodReminderAdminStatus");
    expect(statusLoader).toContain('.eq("school_id", schoolId)');
    expect(statusLoader).toContain("getNextPeriodReminder(");
    expect(statusLoader).toContain("resolvePeriodReminderCandidates({");
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
    expect(notificationModel).not.toContain(
      '["first_period_reminder", "period_change_reminder", "period_reminder"',
    );
  });

  it("dispatches and logs the resolved body without changing the title or campaign feed", () => {
    expect(service).toContain("period_reminder_custom_message");
    expect(service).toContain("title: candidate.title");
    expect(service).toContain("body: candidate.body");
    expect(overview).not.toContain("notification_period_reminder_runs");
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
    expect(devicePreference).toContain(
      "category: PERIOD_REMINDER_CATEGORY, enabled: next",
    );
    expect(deviceApi).toContain('action === "preferences"');
  });

  it("requires school enablement, selected audience, permission, and subscription", () => {
    expect(deviceApi).toContain("periodRemindersAvailable");
    expect(deviceApi).toContain(
      "settings?.period_reminder_audiences?.includes(ctx.device.audience)",
    );
    expect(periodModel).toContain('device.permission_status === "granted"');
    expect(service).toContain('.is("disabled_at", null)');
  });
});
