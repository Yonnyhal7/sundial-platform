"use client";

import { useEffect, useRef, useState } from "react";
import {
  archiveSchoolAction,
  permanentlyDeleteSchoolAction,
  restoreSchoolAction,
} from "./lifecycle-actions";
import {
  EMPTY_LIFECYCLE_STATE,
  confirmationMatches,
  type SchoolDeletionCounts,
} from "@/lib/schoolLifecycle";

type LifecycleMode = "archive" | "restore" | "delete";

function SubmitButton({
  enabled,
  mode,
  pending,
}: {
  enabled: boolean;
  mode: LifecycleMode;
  pending: boolean;
}) {
  const label =
    mode === "archive"
      ? "Archive School"
      : mode === "restore"
        ? "Restore School"
        : "Permanently Delete";
  return (
    <button
      type="submit"
      disabled={!enabled || pending}
      className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
        mode === "restore"
          ? "bg-emerald-600 hover:bg-emerald-500"
          : "bg-red-700 hover:bg-red-600"
      }`}
    >
      {pending ? "Working…" : label}
    </button>
  );
}

const countLabels: [keyof SchoolDeletionCounts, string][] = [
  ["schedules", "Schedules"],
  ["periods", "Periods"],
  ["calendarDays", "Calendar days"],
  ["users", "Assigned users"],
  ["drafts", "Wizard drafts"],
  ["announcements", "Announcements"],
  ["events", "Events"],
  ["sports", "Sports"],
  ["teams", "Teams"],
  ["games", "Games"],
  ["resources", "Resources"],
  ["kioskSettings", "Kiosk settings"],
  ["invitations", "Invitations"],
  ["storedFiles", "Stored files"],
];

export default function SchoolLifecycleDialog({
  mode,
  school,
  counts,
}: {
  mode: LifecycleMode;
  school: { id: string; name: string; subdomain: string };
  counts?: SchoolDeletionCounts;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [irreversible, setIrreversible] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState(EMPTY_LIFECYCLE_STATE);
  const action =
    mode === "archive"
      ? archiveSchoolAction
      : mode === "restore"
        ? restoreSchoolAction
        : permanentlyDeleteSchoolAction;
  const enabled =
    confirmationMatches(confirmation, school.name, school.subdomain) &&
    (mode !== "delete" || irreversible);
  const buttonLabel =
    mode === "archive"
      ? "Archive"
      : mode === "restore"
        ? "Restore"
        : "Permanently Delete";

  useEffect(() => {
    if (dialogRef.current?.open) inputRef.current?.focus();
  }, []);

  function open() {
    setConfirmation("");
    setIrreversible(false);
    dialogRef.current?.showModal();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (mode === "delete")
      console.info("[School deletion]", { stage: "delete_button_clicked" });
    if (!enabled) {
      setState({
        status: "error",
        reason: "validation_failure",
        message: "Complete the confirmation fields before continuing.",
      });
      return;
    }
    if (mode === "delete")
      console.info("[School deletion]", { stage: "validation_passed" });

    setPending(true);
    setState(EMPTY_LIFECYCLE_STATE);
    try {
      if (mode === "delete") {
        console.info("[School deletion]", { stage: "delete_handler_entered" });
        console.info("[School deletion]", {
          stage: "action_invocation_starting",
        });
      }
      if (typeof action !== "function")
        throw new TypeError("Server Action is unavailable.");
      const result = await action(
        EMPTY_LIFECYCLE_STATE,
        new FormData(event.currentTarget),
      );
      if (mode === "delete") {
        console.info("[School deletion]", {
          stage: "action_invocation_returned",
          reason: result.reason || result.status,
        });
      }
      setState(result);
    } catch (error) {
      const name =
        error instanceof Error && /^[A-Za-z][A-Za-z0-9]*Error$/.test(error.name)
          ? error.name
          : "Error";
      if (mode === "delete") {
        console.error("[School deletion]", {
          stage: "client_exception",
          name,
          message: "The Server Action did not return a result.",
        });
      }
      setState({
        status: "error",
        reason: "client_invocation_failure",
        message:
          "The deletion request could not start. Refresh the page and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-bold ${
          mode === "restore"
            ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            : "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
        }`}
      >
        {buttonLabel}
      </button>

      <dialog
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current.close();
        }}
        className="m-auto w-[min(94vw,42rem)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      >
        <form onSubmit={submit} className="p-6 sm:p-8">
          <input type="hidden" name="schoolId" value={school.id} />
          <input type="hidden" name="expectedName" value={school.name} />
          <input
            type="hidden"
            name="expectedSubdomain"
            value={school.subdomain}
          />
          <div
            className={
              mode === "delete"
                ? "rounded-xl border border-red-300 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/30"
                : ""
            }
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700 dark:text-red-300">
              {mode === "delete" ? "Danger Zone" : `${buttonLabel} School`}
            </p>
            <h2 className="mt-2 text-2xl font-bold">{school.name}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {mode === "archive" &&
                "Public, PWA, kiosk, API, sync, and administrative access will be disabled. All school data and staff assignments will be preserved for restoration."}
              {mode === "restore" &&
                "The school website, apps, administration, schedules, and preserved data will become available again. Setup and launch status will not change."}
              {mode === "delete" &&
                "This permanently removes the archived tenant and its school-owned data. Authentication accounts are preserved, but their assignment to this school is removed."}
            </p>
          </div>

          {mode === "delete" && counts && (
            <div className="mt-5">
              <h3 className="text-sm font-bold">
                Records scheduled for deletion
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-3">
                {countLabels.map(([key, label]) => (
                  <div
                    key={key}
                    className="flex justify-between gap-2 border-b border-slate-200 py-1 dark:border-slate-700"
                  >
                    <dt className="text-slate-500 dark:text-slate-400">
                      {label}
                    </dt>
                    <dd className="font-bold">{counts[key]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <label
            className="mt-5 block text-sm font-bold"
            htmlFor={`${mode}-${school.id}`}
          >
            Type <span className="font-mono">{school.name}</span> or{" "}
            <span className="font-mono">{school.subdomain}</span> to confirm
          </label>
          <input
            ref={inputRef}
            id={`${mode}-${school.id}`}
            name="confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-blue-900"
          />

          {mode === "delete" && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-red-200 p-3 text-sm dark:border-red-900">
              <input
                type="checkbox"
                name="irreversible"
                value="yes"
                checked={irreversible}
                onChange={(event) => setIrreversible(event.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                I understand this deletion is irreversible and cannot be undone.
              </span>
            </label>
          )}

          {state.message && (
            <p
              role="status"
              className={`mt-4 text-sm font-semibold ${state.status === "success" ? "text-emerald-700 dark:text-emerald-300" : state.status === "warning" ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"}`}
            >
              {state.message}
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <SubmitButton enabled={enabled} mode={mode} pending={pending} />
          </div>
        </form>
      </dialog>
    </>
  );
}
