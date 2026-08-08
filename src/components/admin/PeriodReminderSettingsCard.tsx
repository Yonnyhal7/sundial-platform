"use client";

import { useState } from "react";
import {
  normalizePeriodReminderCustomMessage,
  PERIOD_REMINDER_CUSTOM_MESSAGE_MAX_LENGTH,
  type PeriodReminderSettings,
} from "@/lib/notifications/periodReminders";

export default function PeriodReminderSettingsCard({
  settings,
  nextReminderLabel,
}: {
  settings: PeriodReminderSettings;
  nextReminderLabel: string | null;
}) {
  const [customMessage, setCustomMessage] = useState(
    settings.period_reminder_custom_message || "",
  );
  const previewBody =
    normalizePeriodReminderCustomMessage(customMessage) ||
    "Period 3 begins at 11:20 AM.";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Period Reminders</h2>
          <p className="mt-1 text-sm text-slate-500">
            Automatically remind students and staff before each scheduled class
            period.
          </p>
        </div>
        <span
          aria-label={`Period reminders status: ${settings.period_reminders_enabled ? "Active" : "Off"}`}
          className={`rounded-full px-3 py-1 text-xs font-black ${settings.period_reminders_enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-black dark:text-slate-300"}`}
        >
          {settings.period_reminders_enabled ? "Active" : "Off"}
        </span>
      </div>
      <label className="mt-6 flex gap-3">
        <input
          type="checkbox"
          name="period_reminders_enabled"
          defaultChecked={settings.period_reminders_enabled}
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
            {(["student", "staff", "parent"] as const).map((audience) => (
              <label key={audience} className="capitalize">
                <input
                  type="checkbox"
                  name="period_reminder_audiences"
                  value={audience}
                  defaultChecked={settings.period_reminder_audiences.includes(
                    audience,
                  )}
                />{" "}
                {audience}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <label
        htmlFor="period-reminder-custom-message"
        className="mt-6 block text-sm font-bold"
      >
        Custom message (optional)
      </label>
      <textarea
        id="period-reminder-custom-message"
        name="period_reminder_custom_message"
        rows={3}
        maxLength={PERIOD_REMINDER_CUSTOM_MESSAGE_MAX_LENGTH}
        value={customMessage}
        onChange={(event) => setCustomMessage(event.target.value)}
        aria-describedby="period-reminder-custom-message-help period-reminder-custom-message-count"
        className="mt-2 w-full rounded-lg border p-3 dark:bg-black"
      />
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
        <p id="period-reminder-custom-message-help">
          Leave blank to use Sundial&apos;s automatic period reminder.
        </p>
        <p id="period-reminder-custom-message-count" aria-live="polite">
          {customMessage.length}/{PERIOD_REMINDER_CUSTOM_MESSAGE_MAX_LENGTH}
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">
            Push preview
          </h3>
          <div className="mt-3 rounded-[2rem] bg-slate-100 p-4 shadow-xl dark:bg-[#333]">
            <div className="rounded-2xl bg-white p-4 text-slate-950">
              <p className="text-xs font-bold text-slate-500">Sundial · now</p>
              <p className="mt-2 font-bold">Period 3 starts in 5 minutes</p>
              <p className="mt-1 text-sm">{previewBody}</p>
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
              {!settings.period_reminders_enabled
                ? "Period reminders are off"
                : nextReminderLabel || "No upcoming period reminder found"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
