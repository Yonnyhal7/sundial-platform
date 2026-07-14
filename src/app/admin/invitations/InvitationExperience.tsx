"use client";

import { useActionState, useEffect, useState } from "react";
import type { SchoolSetupInvitationView } from "@/lib/invitations/acceptance.server";
import {
  acceptInvitationAction,
  exchangeInvitationTokenAction,
  type AcceptInvitationState,
} from "./actions";

function unavailableMessage(status: SchoolSetupInvitationView["status"]) {
  if (status === "expired") return "This invitation has expired. Ask a Sundial SuperAdmin to resend it.";
  if (status === "already_used") return "This invitation has already been used.";
  if (status === "temporarily_locked") {
    return "This invitation is currently being accepted. Please try again shortly.";
  }
  return "This invitation is malformed, invalid, or no longer available.";
}

export default function InvitationExperience({
  initialView,
}: {
  initialView: SchoolSetupInvitationView;
}) {
  const [view, setView] = useState(initialView);
  const [checking, setChecking] = useState(true);
  const [state, formAction, pending] = useActionState<AcceptInvitationState, FormData>(
    acceptInvitationAction,
    {}
  );

  useEffect(() => {
    const rawToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    const exchange = rawToken
      ? exchangeInvitationTokenAction(rawToken)
      : Promise.resolve(initialView);
    exchange
      .then(setView)
      .catch(() => setView({ status: "invalid" }))
      .finally(() => setChecking(false));
  }, [initialView]);

  if (checking) {
    return <p className="mt-6 text-slate-600">Checking your secure invitation…</p>;
  }

  if (view.status !== "valid") {
    return (
      <>
        <h1 className="mt-3 text-3xl font-bold">Invitation unavailable</h1>
        <p className="mt-4 text-slate-600">{unavailableMessage(view.status)}</p>
      </>
    );
  }

  return (
    <>
      <h1 className="mt-3 text-3xl font-bold">Set up {view.schoolName}</h1>
      <p className="mt-3 text-slate-600">
        Create the first school administrator account. This invitation can be used once.
      </p>
      <form action={formAction} className="mt-8 space-y-5">
        <div>
          <label className="text-sm font-semibold text-slate-700" htmlFor="invite-email">Administrator email</label>
          <input id="invite-email" value={view.email ?? ""} readOnly className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-slate-600" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="text-sm font-semibold text-slate-700" htmlFor="first-name">First name</label><input id="first-name" name="firstName" required maxLength={100} autoComplete="given-name" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" /></div>
          <div><label className="text-sm font-semibold text-slate-700" htmlFor="last-name">Last name</label><input id="last-name" name="lastName" required maxLength={100} autoComplete="family-name" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" /></div>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700" htmlFor="new-password">Create password</label>
          <input id="new-password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700" htmlFor="confirm-password">Confirm password</label>
          <input id="confirm-password" name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" />
          <p className="mt-2 text-xs text-slate-500">Your password is never generated, displayed, logged, or sent by email.</p>
        </div>
        {state.error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{state.error}</p>}
        <button type="submit" disabled={pending} className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60">{pending ? "Creating account…" : "Set Up School"}</button>
      </form>
    </>
  );
}
