"use client";

import { useState } from "react";
import {
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_AUDIENCE_LABELS,
  type NotificationAudience,
} from "@/lib/notifications";
import {
  requestNotificationPermissionAndSubscribe,
  saveNotificationAudience,
} from "@/lib/notifications/onboarding";
import { recordPwaResumeDiagnostic } from "@/lib/pwa/resumeDiagnostics";

export default function NotificationAudienceOnboarding({
  schoolId,
  school,
  onComplete,
}: {
  schoolId: string;
  school: string;
  onComplete: (audience: NotificationAudience) => void;
}) {
  const [audience, setAudience] = useState<NotificationAudience | null>(null);
  const [stage, setStage] = useState<
    "audience" | "saving" | "benefits" | "permission" | "error" | "done"
  >("audience");
  const [identity, setIdentity] =
    useState<Awaited<ReturnType<typeof saveNotificationAudience>> | null>(null);
  const [pushError, setPushError] = useState(false);

  async function continueWithAudience() {
    if (!audience) return;
    setStage("saving");
    try {
      const savedIdentity = await saveNotificationAudience({
        schoolId,
        school,
        audience,
      });
      setIdentity(savedIdentity);
      recordPwaResumeDiagnostic("audience_selected");
      setStage("benefits");
    } catch {
      setStage("error");
    }
  }

  async function enablePush() {
    if (!identity) return;
    setPushError(false);
    setStage("permission");
    recordPwaResumeDiagnostic("notification_permission_requested");
    try {
      const result = await requestNotificationPermissionAndSubscribe({ school, identity });
      recordPwaResumeDiagnostic("notification_permission_result", result.permission);
      setStage("done");
      if (audience) onComplete(audience);
    } catch {
      setPushError(true);
      setStage("benefits");
    }
  }

  if (stage === "done") return null;

  return (
    // `sundial-startup-surface` is the opaque, full-viewport, safe-area-aware
    // startup surface defined in the inline launch CSS. It must stay opaque:
    // this step hands straight over from the launch screen, and the Home
    // interface initializing underneath must never be visible through it.
    <div className="sundial-startup-surface">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-onboarding-title"
        className="w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-[#3a3a3a] dark:bg-[#181818]"
      >
        {stage === "benefits" || stage === "permission" ? (
          <>
            <h2 id="notification-onboarding-title" className="text-2xl font-black">
              Stay informed
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-[#b3b3b3]">
              Allow Sundial to send important school announcements, schedule
              changes, and reminders to this device.
            </p>
            {pushError && (
              <p role="alert" className="mt-4 text-sm font-bold text-red-600 dark:text-red-400">
                Notifications couldn&apos;t be enabled. Try again, or continue
                without them.
              </p>
            )}
            <button
              type="button"
              onClick={enablePush}
              disabled={stage === "permission"}
              className="mt-6 min-h-12 w-full rounded-xl bg-[var(--school-primary)] px-4 py-3 font-black text-[var(--school-primary-text)]"
            >
              {stage === "permission" ? "Opening permission…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                recordPwaResumeDiagnostic("notification_permission_result", "skipped");
                setStage("done");
                if (audience) onComplete(audience);
              }}
              className="mt-2 min-h-11 w-full rounded-xl px-4 py-2 text-sm font-bold text-slate-600 dark:text-[#b3b3b3]"
            >
              Not now
            </button>
          </>
        ) : (
          <>
            <h2 id="notification-onboarding-title" className="text-2xl font-black">
              Who is using this device?
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-[#b3b3b3]">
              This controls which school notifications this device receives.
            </p>
            <div className="mt-5 grid gap-3">
              {NOTIFICATION_AUDIENCES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={audience === option}
                  onClick={() => setAudience(option)}
                  disabled={stage === "saving"}
                  className={`min-h-12 rounded-xl border px-4 py-3 text-left font-black ${
                    audience === option
                      ? "border-[var(--school-primary)] bg-[color-mix(in_srgb,var(--school-primary)_12%,transparent)]"
                      : "border-slate-300 dark:border-[#454545]"
                  }`}
                >
                  {NOTIFICATION_AUDIENCE_LABELS[option]}
                </button>
              ))}
            </div>
            <p className="mt-5 text-xs font-semibold leading-5 text-slate-500 dark:text-[#999]">
              This choice is saved for this browser and may remain if you remove
              the Home Screen app.
            </p>
            {stage === "error" && (
              <p role="alert" className="mt-4 text-sm font-bold text-red-600 dark:text-red-400">
                We couldn&apos;t save this device. Check your connection and try
                again.
              </p>
            )}
            <button
              type="button"
              onClick={continueWithAudience}
              disabled={!audience || stage === "saving"}
              className="mt-5 min-h-12 w-full rounded-xl bg-[var(--school-primary)] px-4 py-3 font-black text-[var(--school-primary-text)] disabled:opacity-50"
            >
              {stage === "saving" ? "Saving…" : stage === "error" ? "Retry" : "Continue"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
