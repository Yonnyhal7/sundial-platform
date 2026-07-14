"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  resendSchoolSetupInvitationAction,
  type ResendInvitationState,
} from "./invitation-actions";

export default function ResendSetupEmailButton({
  inviteId,
  schoolId,
}: {
  inviteId: string;
  schoolId: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ResendInvitationState, FormData>(
    resendSchoolSetupInvitationAction,
    {}
  );
  useEffect(() => {
    if (state.status === "sent" || state.status === "failed") router.refresh();
  }, [router, state.status]);

  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="inviteId" value={inviteId} />
      <input type="hidden" name="schoolId" value={schoolId} />
      <button type="submit" disabled={pending} className="cursor-pointer text-xs font-bold text-blue-600 hover:text-blue-500 disabled:cursor-wait disabled:opacity-60">
        {pending ? "Sending…" : "Resend Setup Email"}
      </button>
      {state.message && <p aria-live="polite" className={`mt-1 max-w-xs text-xs ${state.status === "sent" ? "text-emerald-700" : "text-amber-700"}`}>{state.message}</p>}
    </form>
  );
}
