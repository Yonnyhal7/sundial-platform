"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import TimezoneSelect from "@/components/TimezoneSelect";
import { formatDateTimeInTimeZone, getTimeZoneFriendlyName, getTimeZoneLabel } from "@/lib/timezones";
import {
  retrySchoolTimezoneSyncAction,
  saveSchoolTimezoneAction,
  type SchoolTimezoneActionState,
} from "./actions";

const INITIAL_SCHOOL_TIMEZONE_STATE: SchoolTimezoneActionState = { status: "idle" };

export default function TimezoneSettingsForm({
  school,
  schoolName,
  timezone,
  version,
}: {
  school: string;
  schoolName: string;
  timezone: string;
  version: number;
}) {
  const [state, action, pending] = useActionState(
    saveSchoolTimezoneAction,
    INITIAL_SCHOOL_TIMEZONE_STATE
  );
  const [retryState, retryAction, retryPending] = useActionState(
    retrySchoolTimezoneSyncAction,
    INITIAL_SCHOOL_TIMEZONE_STATE
  );
  const [selected, setSelected] = useState(timezone);
  const [now, setNow] = useState(() => new Date());
  const currentTimezone = state.timezone || timezone;
  const currentVersion = state.version || version;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const preview = useMemo(
    () => formatDateTimeInTimeZone(now, selected),
    [now, selected]
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
      <h2 className="text-xl font-bold text-slate-950 dark:text-white">Timezone</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        This timezone controls dates, schedules, events, and current-time calculations throughout your school&apos;s Sundial experience.
      </p>
      <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-[#181818]">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current timezone</p>
        <p className="mt-1 font-bold text-slate-950 dark:text-white">{getTimeZoneLabel(currentTimezone, now)}</p>
        <p className="mt-1 text-xs text-slate-500">{currentTimezone}</p>
      </div>
      <form
        action={action}
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          if (selected === currentTimezone) return;
          const confirmed = window.confirm(
            `Change ${schoolName}'s timezone from ${getTimeZoneFriendlyName(currentTimezone)} to ${getTimeZoneFriendlyName(selected)}? This may immediately change the current date, active period, event times, and kiosk countdown.`
          );
          if (!confirmed) event.preventDefault();
        }}
      >
        <input type="hidden" name="school" value={school} />
        <input type="hidden" name="version" value={currentVersion} />
        <input type="hidden" name="confirmed" value="true" />
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
          School timezone
          <TimezoneSelect name="timezone" value={selected} onChange={setSelected} disabled={pending} />
        </label>
        <div className="rounded-xl border border-slate-200 p-4 dark:border-[#3a3a3a]">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Local date and time preview</p>
          <p className="mt-1 font-semibold" aria-live="polite">{preview}</p>
        </div>
        {state.message && (
          <p
            role={state.status === "success" ? "status" : "alert"}
            className={`rounded-lg p-3 text-sm font-semibold ${state.status === "success" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"}`}
          >
            {state.message}
            {state.status === "stale" && (
              <button type="button" onClick={() => location.reload()} className="ml-2 underline">Reload</button>
            )}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || selected === currentTimezone}
          className="cursor-pointer rounded-xl bg-[var(--school-primary)] px-6 py-3 text-sm font-bold text-[var(--school-primary-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save Timezone"}
        </button>
      </form>
      {state.status === "refresh_warning" && (
        <form action={retryAction} className="mt-3">
          <input type="hidden" name="school" value={school} />
          <button disabled={retryPending} className="cursor-pointer text-sm font-bold text-blue-700 underline dark:text-blue-300">
            {retryPending ? "Retrying…" : "Retry offline synchronization"}
          </button>
          {retryState.message && <p role={retryState.status === "success" ? "status" : "alert"} className="mt-2 text-sm">{retryState.message}</p>}
        </form>
      )}
    </section>
  );
}
