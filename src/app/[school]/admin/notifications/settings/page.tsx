import { notFound } from "next/navigation";
import NotificationBackButton from "@/components/admin/NotificationBackButton";
import {
  getSchoolAdminPath,
  requireAdminSectionAccess,
} from "@/lib/auth/adminPermissions";
import {
  addDaysToLocalDateString,
  formatDateInTimeZone,
} from "@/lib/localDate";
import {
  getNextPeriodReminder,
  resolvePeriodReminderCandidates,
  type PeriodReminderSettings,
} from "@/lib/notifications/periodReminders";
import { formatTimestampInTimeZone } from "@/lib/timezones";
import { getSchoolForSetup } from "@/lib/schools";
import { saveNotificationSettingsAction } from "../actions";

type SettingsRow = PeriodReminderSettings & {
  version: number;
  scheduled_notifications_enabled: boolean;
  sender_display_name: string | null;
};

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
  const { data } = await supabase
    .from("notification_school_settings")
    .select("*")
    .eq("school_id", schoolData.id)
    .single<SettingsRow>();
  if (!data) notFound();
  const now = new Date();
  const timezone = schoolData.timezone || "America/Los_Angeles";
  const today = formatDateInTimeZone(now, timezone);
  const endDate = addDaysToLocalDateString(today, 14);
  const { data: days } = await supabase
    .from("calendar_days")
    .select("school_id,date,schedule_id,is_school_day")
    .eq("school_id", schoolData.id)
    .gte("date", today)
    .lte("date", endDate)
    .order("date");
  const scheduleIds = [
    ...new Set(
      (days || [])
        .map((day) => day.schedule_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [{ data: schedules }, { data: periods }] = scheduleIds.length
    ? await Promise.all([
        supabase
          .from("schedules")
          .select("id,school_id,active,setup_status")
          .eq("school_id", schoolData.id)
          .in("id", scheduleIds),
        supabase
          .from("periods")
          .select(
            "id,school_id,schedule_id,name,start_time,end_time,sort_order",
          )
          .eq("school_id", schoolData.id)
          .in("schedule_id", scheduleIds),
      ])
    : [{ data: [] }, { data: [] }];
  const scheduleById = new Map(
    (schedules || []).map((schedule) => [schedule.id, schedule]),
  );
  const next = getNextPeriodReminder(
    (days || []).flatMap((day) =>
      resolvePeriodReminderCandidates({
        school: { id: schoolData.id, subdomain: school, timezone },
        settings: data,
        calendarDay: day,
        schedule: day.schedule_id
          ? scheduleById.get(day.schedule_id) || null
          : null,
        periods: (periods || []).filter(
          (period) => period.schedule_id === day.schedule_id,
        ),
      }),
    ),
    now,
  );
  const notificationsHref = `${await getSchoolAdminPath(school)}/notifications`;
  const save = saveNotificationSettingsAction.bind(null, school, data.version);

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
              defaultChecked={data.notifications_enabled}
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
              defaultChecked={data.scheduled_notifications_enabled}
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
              defaultValue={data.sender_display_name || ""}
              className="mt-2 w-full rounded-lg border p-3 dark:bg-black"
            />
          </label>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Period Reminders</h2>
              <p className="mt-1 text-sm text-slate-500">
                Automatically remind students and staff before each scheduled
                class period.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${data.period_reminders_enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-black dark:text-slate-300"}`}
            >
              {data.period_reminders_enabled ? "Active" : "Off"}
            </span>
          </div>
          <label className="mt-6 flex gap-3">
            <input
              type="checkbox"
              name="period_reminders_enabled"
              defaultChecked={data.period_reminders_enabled}
            />
            <span>
              <b>Enable period reminders</b>
              <small className="block text-slate-500">
                Uses each date&apos;s assigned Sundial schedule automatically.
              </small>
            </span>
          </label>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-sm font-bold">Reminder timing</p>
              <p className="mt-1 text-sm text-slate-500">
                5 minutes before each period
              </p>
            </div>
            <fieldset>
              <legend className="text-sm font-bold">Audience</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {["student", "staff", "parent"].map((audience) => (
                  <label key={audience} className="capitalize">
                    <input
                      type="checkbox"
                      name="period_reminder_audiences"
                      value={audience}
                      defaultChecked={data.period_reminder_audiences.includes(
                        audience as "student" | "staff" | "parent",
                      )}
                    />{" "}
                    {audience}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">
                Push preview
              </h3>
              <div className="mt-3 rounded-[2rem] bg-slate-100 p-4 shadow-xl dark:bg-[#333]">
                <div className="rounded-2xl bg-white p-4 text-slate-950">
                  <p className="text-xs font-bold text-slate-500">
                    Sundial · now
                  </p>
                  <p className="mt-2 font-bold">Period 3 starts in 5 minutes</p>
                  <p className="mt-1 text-sm">Period 3 begins at 11:20 AM.</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 rounded-2xl bg-slate-50 p-5 dark:bg-black">
              <div>
                <p className="text-sm font-black">Schedule aware</p>
                <p className="mt-1 text-sm text-slate-500">
                  No reminders are sent on dates without an active assigned
                  schedule.
                </p>
              </div>
              <div>
                <p className="text-sm font-black">Next scheduled reminder</p>
                <p className="mt-1 text-sm text-slate-500">
                  {!data.period_reminders_enabled
                    ? "Period reminders are off"
                    : next
                      ? `${next.periodName} · ${formatTimestampInTimeZone(next.reminderAt, timezone)}`
                      : "No upcoming period reminder found"}
                </p>
              </div>
            </div>
          </div>
        </section>
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
