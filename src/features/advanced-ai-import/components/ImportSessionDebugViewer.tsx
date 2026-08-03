"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type DebugData = { session: Record<string, unknown>; sourcePdfUrl: string | null; pages: Array<Record<string, unknown> & { signedUrl?: string }>; artifacts: Array<Record<string, unknown>>; diagnostics: Array<Record<string, unknown>> };

export function ImportSessionDebugViewer({ schoolSlug, sessionId }: { schoolSlug: string; sessionId: string }) {
  const [data, setData] = useState<DebugData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void fetch(`/api/admin/${encodeURIComponent(schoolSlug)}/calendar/advanced-ai-import/sessions/${sessionId}`).then(async (response) => {
    if (!response.ok) throw new Error("Import session debug data is unavailable");
    setData(await response.json());
  }).catch((reason) => setError(reason instanceof Error ? reason.message : "Debug data unavailable")); }, [schoolSlug, sessionId]);
  return <aside className="mx-auto mb-10 max-w-7xl rounded-2xl border border-purple-300 bg-purple-50 p-5 text-slate-950 dark:border-purple-800 dark:bg-purple-950/20 dark:text-white">
    <h2 className="text-lg font-bold">Advanced Import Session Debug</h2>
    {error && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {!data && !error && <p className="mt-3 text-sm">Loading session workspace…</p>}
    {data && <div className="mt-4 space-y-5 text-xs">
      <DebugSection title="Import Session" value={data.session} />
      <p>{data.sourcePdfUrl ? <a className="font-bold underline" href={data.sourcePdfUrl} target="_blank" rel="noreferrer">Open uploaded PDF</a> : "Uploaded PDF unavailable"}</p>
      <div><h3 className="font-bold">Rendered Pages & Metadata</h3><div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.pages.map((page) => <figure key={String(page.page_number)} className="rounded-lg border border-purple-200 p-2 dark:border-purple-900">{page.signedUrl && <Image unoptimized src={page.signedUrl} width={Number(page.width) || 1} height={Number(page.height) || 1} alt={`Rendered PDF page ${page.page_number}`} className="h-auto w-full" />}<figcaption className="mt-2"><pre className="overflow-auto">{JSON.stringify(page, null, 2)}</pre></figcaption></figure>)}</div></div>
      <DebugSection title="Artifact Registry" value={data.artifacts} />
      <DebugSection title="Diagnostics" value={data.diagnostics} />
    </div>}
  </aside>;
}

function DebugSection({ title, value }: { title: string; value: unknown }) { return <section><h3 className="font-bold">{title}</h3><pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-white p-3 dark:bg-black">{JSON.stringify(value, null, 2)}</pre></section>; }
