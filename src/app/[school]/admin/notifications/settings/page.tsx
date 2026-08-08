import { notFound } from "next/navigation";
import NotificationBackButton from "@/components/admin/NotificationBackButton";
import PeriodReminderSettingsCard from "@/components/admin/PeriodReminderSettingsCard";
import {
  getSchoolAdminPath,
  requireAdminSectionAccess,
} from "@/lib/auth/adminPermissions";
import { formatPeriodReminderNextLabel } from "@/lib/notifications/periodReminders";
import { getPeriodReminderAdminStatus } from "@/lib/notifications/periodReminderStatus.server";
import { getSchoolForSetup } from "@/lib/schools";
import { saveNotificationSettingsAction } from "../actions";

export default async function NotificationSettings({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const schoolData = await getSchoolForSetup(school);
  if (!schoolData) notFound();
  const { supabase } = await requireAdminSectionAccess(
    schoolData.id,
    "notifications",
    school,
  );
  const timezone = schoolData.timezone || "America/Los_Angeles";
  const status = await getPeriodReminderAdminStatus({
    supabase,
    schoolId: schoolData.id,
    schoolSlug: school,
    timeZone: timezone,
  });
  if (!status) notFound();
  const { settings, next, now } = status;
  const notificationsHref = `${await getSchoolAdminPath(school)}/notifications`;
  const save = saveNotificationSettingsAction.bind(
    null,
    school,
    settings.version,
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 text-slate-950 dark:text-white">
      <NotificationBackButton fallbackHref={notificationsHref} />
      <p className="text-sm text-slate-500">{schoolData.name} Admin</p>
      <h1 className="text-3xl font-bold">Notification settings</h1>
      <form action={save} className="mt-6 space-y-6">
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-[#3a3a3a] dark:bg-[#242424]">
          <label className="flex gap-3">
            <input
              type="checkbox"
              name="notifications_enabled"
              defaultChecked={settings.notifications_enabled}
            />
            <span>
              <b>Enable notifications</b>
              <small className="block text-slate-500">
                Allow campaigns and inbox delivery for this school.
              </small>
            </span>
          </label>
          <label className="flex gap-3">
            <input
              type="checkbox"
              name="scheduled_notifications_enabled"
              defaultChecked={settings.scheduled_notifications_enabled}
            />
            <span>
              <b>Enable scheduled notifications</b>
              <small className="block text-slate-500">
                Allow delivery by the scheduled worker.
              </small>
            </span>
          </label>
          <label className="block text-sm font-bold">
            Sender display name
            <input
              name="sender_display_name"
              maxLength={80}
              defaultValue={settings.sender_display_name || ""}
              className="mt-2 w-full rounded-lg border p-3 dark:bg-black"
            />
          </label>
        </section>

        <PeriodReminderSettingsCard
          settings={settings}
          nextReminderLabel={
            next ? formatPeriodReminderNextLabel(next, now, timezone) : null
          }
        />

        <p className="text-sm text-slate-500">
          Emergency behavior: preferences are respected. Critical-alert
          entitlement is not claimed.
        </p>
        <button className="rounded-lg bg-[var(--school-primary)] px-5 py-3 font-bold text-[var(--school-primary-text)]">
          Save settings
        </button>
      </form>
    </main>
  );
}
