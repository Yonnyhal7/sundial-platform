import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const api = read("../app/api/schools/[school]/notifications/route.ts");
const migration = read("../../supabase/migrations/20260725120000_notification_device_inbox_state.sql");
const inbox = read("../components/mobile-app/NotificationInbox.tsx");
const detail = read("../components/mobile-app/NotificationDetail.tsx");
const client = read("./notifications/inboxClient.ts");
const cron = read("../app/api/cron/notifications/route.ts");

describe("device notification inbox", () => {
  it("scopes reads and soft deletion to the verified device and tenant", () => {
    expect(api).toContain('.eq("school_id", ctx.school.id).eq("device_id", ctx.device.id)');
    expect(api).toContain('.is("deleted_at", null)');
    expect(api).toContain('action === "delete"');
    expect(api).toContain('action === "delete_read"');
    expect(api).not.toMatch(/from\("notification_campaigns"\)\s*\.delete/);
  });

  it("provides accessible list, detail, confirmation, and immediate badge behavior", () => {
    expect(inbox).toContain("Unread notification");
    expect(inbox).toContain("Mark all as read");
    expect(inbox).toContain("Delete all read");
    expect(inbox).toContain('role="status"');
    expect(detail).toContain("Back to Notifications");
    expect(detail).toContain("Delete notification?");
    expect(detail).toContain("This removes the notification from this device only.");
    expect(detail).toContain('aria-modal="true"');
    expect(detail).toContain("updateCachedInbox");
  });

  it("keeps cached data device/tenant scoped and queues only idempotent offline reads", () => {
    expect(client).toContain("schoolId");
    expect(client).toContain("identity.installationId");
    expect(client).toContain("pending-reads:v1");
    expect(client).toContain("new Set");
    expect(client).not.toContain("pending-deletes");
  });

  it("retains unread longer and removes only delivery inbox rows", () => {
    expect(migration).toContain("read_at is not null and created_at < now() - interval '90 days'");
    expect(migration).toContain("created_at < now() - interval '180 days'");
    expect(migration).toContain("delete from public.notification_deliveries");
    expect(migration).not.toContain("delete from public.notification_campaigns");
    expect(migration).not.toContain("delete from public.notification_audit");
    expect(cron).toContain("cleanupNotificationDeviceInbox");
  });
});
