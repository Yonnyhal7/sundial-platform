"use client";

import { useState } from "react";
import {
  AI_CALENDAR_DEBUG_WARNING,
  type AiCalendarDebugIssue,
  type AiCalendarDebugResolutionEvent,
  type AiCalendarDebugSnapshot,
} from "@/lib/calendarWizard/aiCalendarDebug";

function formatDebugDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function safeFilePart(value: string | undefined, fallback: string) {
  const normalized = (value || "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function Detail({ label, value }: { label: string; value: string | number | boolean | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words font-mono text-xs text-slate-900 dark:text-slate-100">
        {value === undefined || value === "" ? "—" : String(value)}
      </dd>
    </div>
  );
}

function IssueDetails({ issue, index }: { issue: AiCalendarDebugIssue; index: number }) {
  return (
    <article className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-[#202020]">
      <h5 className="font-bold text-slate-950 dark:text-white">
        {issue.unresolvedBlocker ? `Blocker ${index + 1}` : `Issue ${index + 1}`}
      </h5>
      <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {issue.displayMessage}
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Detail label="Issue ID" value={issue.issueId} />
        <Detail label="Issue code" value={issue.issueCode} />
        <Detail label="Severity" value={issue.severity} />
        <Detail label="Status" value={issue.status} />
        <Detail label="Affected dates" value={issue.affectedDates.map(formatDebugDate).join(", ")} />
        <Detail label="Source labels" value={issue.sourceLabels.join(", ")} />
        <Detail label="Current classification" value={issue.currentClassification} />
        <Detail label="Proposed classification" value={issue.proposedClassification} />
        <Detail label="Created by" value={issue.createdBy} />
        <Detail label="Source array" value={issue.sourceArray} />
        <Detail label="Persisted/generated" value={issue.persistedOrGenerated} />
        <Detail label="Analysis version" value={issue.analysisVersion} />
        <Detail label="Analysis attempt" value={issue.analysisAttemptId} />
        <Detail label="Cache strategy" value={issue.cacheStrategy} />
        <Detail label="Cache state" value={issue.cacheState} />
        <Detail label="Resolution state" value={issue.resolutionState} />
        <Detail label="Unresolved blocker" value={issue.unresolvedBlocker} />
        <Detail label="Disables Create Calendar" value={issue.disablesCreateCalendar} />
        <Detail label="Why it blocks" value={issue.blockingReason} />
        <Detail label="Canonical issue key" value={issue.canonicalIssueKey} />
        <Detail label="Related warning codes" value={issue.relatedWarningCodes.join(", ")} />
        <Detail label="Schedule IDs / keys" value={issue.relatedScheduleIds.join(", ")} />
        <Detail label="Preview assignment source" value={issue.previewAssignmentSource} />
        <Detail label="Rotation behavior" value={issue.rotationBehavior} />
        <Detail label="Created at stage" value={issue.createdAtStage} />
        <Detail label="Last modified at stage" value={issue.lastModifiedAtStage} />
        <Detail label="Severity changed at" value={issue.severityChangedAtStage} />
        <Detail label="Status changed at" value={issue.statusChangedAtStage} />
      </dl>
      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Issue history
        </p>
        <ol className="mt-2 space-y-1 font-mono text-xs text-slate-700 dark:text-slate-200">
          {issue.history.map((entry, historyIndex) => (
            <li key={`${entry.stage}-${historyIndex}`}>
              {entry.stage}: {entry.severity} / {entry.status}
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

export default function AiCalendarDebugPanel({
  clientSnapshot,
  serverSnapshot,
  serverState,
  resolutionEvents,
  onRefreshServerSnapshot,
}: {
  clientSnapshot: AiCalendarDebugSnapshot;
  serverSnapshot: AiCalendarDebugSnapshot | null;
  serverState: "idle" | "loading" | "loaded" | "failed";
  resolutionEvents: AiCalendarDebugResolutionEvent[];
  onRefreshServerSnapshot: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const clientOnly = clientSnapshot.blockerIds.filter(
    (id) => !serverSnapshot?.blockerIds.includes(id)
  );
  const serverOnly = (serverSnapshot?.blockerIds || []).filter(
    (id) => !clientSnapshot.blockerIds.includes(id)
  );
  const mismatch = Boolean(serverSnapshot && (clientOnly.length > 0 || serverOnly.length > 0));
  const exported = {
    client: clientSnapshot,
    server: serverSnapshot,
    comparison: {
      clientBlockingIssueIds: clientSnapshot.blockerIds,
      serverBlockingIssueIds: serverSnapshot?.blockerIds || [],
      clientOnly,
      serverOnly,
      mismatch,
    },
    resolutionEvents,
  };

  async function copy(value: unknown, label: string) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-calendar-debug-${safeFilePart(clientSnapshot.scope.schoolSlug, "school")}-${safeFilePart(clientSnapshot.analysisAttemptId, "attempt")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const blockers = clientSnapshot.issues.filter((issue) => issue.unresolvedBlocker);
  const countEntries = Object.entries(clientSnapshot.counts);

  return (
    <details className="mt-4 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/60 p-4 dark:border-violet-800 dark:bg-violet-950/20">
      <summary className="cursor-pointer font-bold text-violet-950 dark:text-violet-100">
        AI Import Debug Details
        <span className="ml-3 inline-flex rounded-full bg-violet-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-violet-950 dark:bg-violet-900 dark:text-violet-100">
          {AI_CALENDAR_DEBUG_WARNING}
        </span>
      </summary>

      <div className="mt-5 space-y-5">
        <section className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
          <h4 className="font-bold text-red-950 dark:text-red-100">
            Current blocker count: {clientSnapshot.counts.unresolvedBlockingCount}
          </h4>
          {blockers.length === 0 ? (
            <p className="mt-2 text-sm font-semibold text-red-900 dark:text-red-100">
              The normalized client issue collection has no unresolved warning blockers.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {blockers.map((issue, index) => (
                <IssueDetails key={issue.canonicalIssueKey} issue={issue} index={index} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h4 className="font-bold text-slate-950 dark:text-white">Safe derived counts</h4>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {countEntries.map(([label, value]) => (
              <Detail key={label} label={label.replace(/([A-Z])/g, " $1")} value={value} />
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-slate-300 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="font-bold text-slate-950 dark:text-white">Client/server comparison</h4>
            <button type="button" onClick={onRefreshServerSnapshot} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700">
              {serverState === "loading" ? "Loading server state…" : "Refresh server state"}
            </button>
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Detail label="Client blocking issue IDs" value={clientSnapshot.blockerIds.join(", ")} />
            <Detail label="Server blocking issue IDs" value={serverSnapshot?.blockerIds.join(", ") || (serverState === "failed" ? "Unavailable" : "Not loaded")} />
            <Detail label="Only on client" value={clientOnly.join(", ")} />
            <Detail label="Only on server" value={serverOnly.join(", ")} />
          </dl>
          {mismatch && (
            <p className="mt-3 rounded-lg bg-red-100 p-3 text-sm font-bold text-red-900 dark:bg-red-950 dark:text-red-100">
              Client/server blocker mismatch
            </p>
          )}
        </section>

        <section>
          <h4 className="font-bold text-slate-950 dark:text-white">Cache and draft diagnostics</h4>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Analysis version" value={clientSnapshot.analysisVersion} />
            <Detail label="Cached result version" value={clientSnapshot.restore.cachedResultVersion} />
            <Detail label="Draft version" value={clientSnapshot.restore.draftVersion} />
            <Detail label="Restored from cache" value={clientSnapshot.restore.restoredFromCache} />
            <Detail label="Restored from wizard draft" value={clientSnapshot.restore.restoredFromWizardDraft} />
            <Detail label="Current attempt ID" value={clientSnapshot.restore.currentAnalysisAttemptId} />
            <Detail label="Draft attempt ID" value={clientSnapshot.restore.draftAnalysisAttemptId} />
            <Detail label="Stale draft detected" value={clientSnapshot.restore.staleDraftDetected} />
          </dl>
          {(clientSnapshot.restore.staleDraftDetected ||
            (clientSnapshot.restore.currentAnalysisAttemptId &&
              clientSnapshot.restore.draftAnalysisAttemptId &&
              clientSnapshot.restore.currentAnalysisAttemptId !== clientSnapshot.restore.draftAnalysisAttemptId)) && (
            <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm font-bold text-amber-950 dark:bg-amber-950 dark:text-amber-100">
              Debug warning: review state was restored from an older analysis attempt.
            </p>
          )}
        </section>

        <section>
          <h4 className="font-bold text-slate-950 dark:text-white">All current issues</h4>
          <div className="mt-3 space-y-3">
            {clientSnapshot.issues.map((issue, index) => (
              <IssueDetails key={`${issue.canonicalIssueKey}-${index}`} issue={issue} index={index} />
            ))}
          </div>
        </section>

        <section>
          <h4 className="font-bold text-slate-950 dark:text-white">Resolution action diagnostics</h4>
          {resolutionEvents.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No resolution action has been recorded in this browser session.</p>
          ) : (
            <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(resolutionEvents, null, 2)}
            </pre>
          )}
        </section>

        <div className="flex flex-wrap gap-2 border-t border-violet-200 pt-4 dark:border-violet-900">
          <button type="button" onClick={() => void copy(exported, "Debug summary")} className="rounded-lg border border-violet-300 px-3 py-2 text-xs font-bold dark:border-violet-800">
            Copy Debug Summary
          </button>
          <button type="button" onClick={() => void copy({ blockerIds: clientSnapshot.blockerIds, issues: blockers }, "Current blockers")} className="rounded-lg border border-violet-300 px-3 py-2 text-xs font-bold dark:border-violet-800">
            Copy Current Blockers
          </button>
          <button type="button" onClick={download} className="rounded-lg border border-violet-300 px-3 py-2 text-xs font-bold dark:border-violet-800">
            Download Debug JSON
          </button>
          {copyStatus && <p role="status" className="self-center text-xs font-bold text-violet-900 dark:text-violet-100">{copyStatus}</p>}
        </div>
      </div>
    </details>
  );
}
