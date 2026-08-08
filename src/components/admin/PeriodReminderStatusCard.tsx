import Link from "next/link";
import {
  getPeriodReminderAudienceSummary,
  PERIOD_REMINDER_LEAD_MINUTES,
  type PeriodReminderSettings,
} from "@/lib/notifications/periodReminders";

export default function PeriodReminderStatusCard({
  settings,
  nextReminderLabel,
  settingsHref,
}: {
  settings: PeriodReminderSettings;
  nextReminderLabel: string | null;
  settingsHref: string;
}) {
  const enabled =
    settings.notifications_enabled && settings.period_reminders_enabled;
  return (
    <section
      aria-labelledby="period-reminder-status-title"
      className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="period-reminder-status-title" className="font-black">
            Period reminders
          </h2>
          <span
            aria-label={`Period reminders status: ${enabled ? "Active" : "Off"}`}
            className={`rounded-full px-2.5 py-1 text-xs font-black ${enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-black dark:text-slate-300"}`}
          >
            {enabled ? "Active" : "Off"}
          </span>
        </div>
        {enabled ? (
          <>
            <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
              {getPeriodReminderAudienceSummary(
                settings.period_reminder_audiences,
              )}{" "}
              · {PERIOD_REMINDER_LEAD_MINUTES} min before
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {nextReminderLabel
                ? `Next: ${nextReminderLabel}`
                : "No upcoming reminder found"}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            Automatic schedule reminders are disabled.
          </p>
        )}
      </div>
      <Link
        href={settingsHref}
        className="inline-flex min-h-11 shrink-0 items-center justify-center self-start rounded-lg border border-[var(--school-primary)] px-4 py-2 text-sm font-black text-[var(--school-primary)] hover:bg-[color-mix(in_srgb,var(--school-primary)_8%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-primary)] sm:self-auto"
      >
        {enabled ? "Manage" : "Set up"}
      </Link>
    </section>
  );
}
