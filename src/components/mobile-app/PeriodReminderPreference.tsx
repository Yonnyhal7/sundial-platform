"use client";

import { useEffect, useState } from "react";
import {
  getNotificationDeviceIdentity,
  notificationDeviceHeaders,
} from "@/lib/notifications/deviceClient";
import { mutateDeviceInbox } from "@/lib/notifications/inboxClient";
import { PERIOD_REMINDER_CATEGORY } from "@/lib/notifications/periodReminders";

export default function PeriodReminderPreference({
  school,
  schoolId,
}: {
  school: string;
  schoolId: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const identity = getNotificationDeviceIdentity(schoolId);
    if (!identity) {
      const timeout = window.setTimeout(() => {
        setStatus("Notifications are not set up on this device.");
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    fetch(
      `/api/schools/${encodeURIComponent(school)}/notifications?view=preferences`,
      {
        headers: notificationDeviceHeaders(identity),
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = (await response.json()) as {
          periodRemindersAvailable?: boolean;
          preferences?: { category: string; enabled: boolean }[];
        };
        setAvailable(payload.periodRemindersAvailable === true);
        setEnabled(
          payload.preferences?.find(
            (preference) => preference.category === PERIOD_REMINDER_CATEGORY,
          )?.enabled === true,
        );
      })
      .catch(() => setStatus("Preference unavailable while offline."))
      .finally(() => setLoading(false));
  }, [school, schoolId]);

  async function update(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setStatus("Saving…");
    try {
      await mutateDeviceInbox(schoolId, school, {
        action: "preferences",
        preferences: [{ category: PERIOD_REMINDER_CATEGORY, enabled: next }],
      });
      setStatus(
        next
          ? "Period reminders enabled on this device."
          : "Period reminders disabled on this device.",
      );
    } catch {
      setEnabled(previous);
      setStatus("Unable to save this preference. Try again when online.");
    }
  }

  return (
    <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 dark:border-[#3a3a3a] dark:bg-[#242424]">
      <label className="flex items-start justify-between gap-4">
        <span>
          <b className="block">Period reminders</b>
          <small className="mt-1 block text-slate-500">
            Receive a push 5 minutes before each scheduled period.
          </small>
          {!loading && !available && (
            <small className="mt-2 block font-bold text-slate-500">
              Not currently enabled by your school.
            </small>
          )}
        </span>
        <input
          type="checkbox"
          aria-label="Period reminders"
          checked={enabled}
          disabled={loading || !available}
          onChange={(event) => void update(event.target.checked)}
        />
      </label>
      <p
        aria-live="polite"
        className="mt-3 min-h-5 text-xs font-semibold text-slate-500"
      >
        {status}
      </p>
    </section>
  );
}
