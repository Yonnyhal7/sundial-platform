"use client";

import { useActionState, useState } from "react";
import {
  resendSchoolSetupInvitationAction,
  type ResendInvitationState,
} from "./invitation-actions";

export default function ResendSetupEmailButton({
  inviteId,
  schoolId,
  initialExpiresAt,
}: {
  inviteId: string;
  schoolId: string;
  initialExpiresAt?: string;
}) {
  const [state, action, pending] = useActionState<ResendInvitationState, FormData>(
    resendSchoolSetupInvitationAction,
    {}
  );
  const [copied, setCopied] = useState(false);
  const fallbackUrl = state.fallbackUrl;
  const expiresAt = state.expiresAt || initialExpiresAt;

  return (
    <div className="mt-2 max-w-md rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
        Email delivery needs attention
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="inviteId" value={inviteId} />
          <input type="hidden" name="schoolId" value={schoolId} />
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer text-xs font-bold text-blue-700 hover:text-blue-600 disabled:cursor-wait disabled:opacity-60 dark:text-blue-300"
          >
            {pending ? "Sending…" : "Resend email"}
          </button>
        </form>
        {fallbackUrl && (
          <button
            type="button"
            className="cursor-pointer text-xs font-bold text-blue-700 hover:text-blue-600 dark:text-blue-300"
            onClick={async () => {
              await navigator.clipboard.writeText(fallbackUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Invitation link copied" : "Copy invitation link"}
          </button>
        )}
      </div>
      {!fallbackUrl && (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          Resend once to create and display a current copyable link.
        </p>
      )}
      {expiresAt && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          Link expires {new Date(expiresAt).toLocaleString()}.
        </p>
      )}
      {state.tokenRotated && (
        <p className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
          This is a replacement link. Any older copied link is no longer valid.
        </p>
      )}
      {state.message && (
        <p
          aria-live="polite"
          className={`mt-2 text-xs ${
            state.status === "sent"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-amber-800 dark:text-amber-200"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
