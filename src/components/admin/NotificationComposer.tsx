"use client";

import { useMemo, useState } from "react";
import { NOTIFICATION_CATEGORY_GROUPS, NOTIFICATION_CATEGORY_LABELS, NOTIFICATION_TEMPLATES } from "@/lib/notifications";

export default function NotificationComposer({ action, timezone, error }: { action: (formData: FormData) => void; timezone: string; error?: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("important_announcement");
  const [audiences, setAudiences] = useState<string[]>(["student", "parent"]);
  const idempotency = useMemo(() => crypto.randomUUID(), []);
  function template(key: string) {
    const value = NOTIFICATION_TEMPLATES[key as keyof typeof NOTIFICATION_TEMPLATES];
    if (value) { setTitle(value.title); setBody(value.body); setCategory(value.category); }
  }
  return <form action={action} className="grid gap-6 lg:grid-cols-[1fr_22rem]">
    <input type="hidden" name="idempotency_key" value={idempotency} />
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">The notification could not be saved ({error}).</p>}
      <label className="block text-sm font-bold">Template<select className="mt-2 w-full rounded-lg border p-3 dark:bg-black" defaultValue="" onChange={(e) => template(e.target.value)}><option value="">Start from scratch</option>{Object.entries(NOTIFICATION_TEMPLATES).map(([key,value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <label className="block text-sm font-bold">Title <span className="float-right font-medium text-slate-500">{title.length}/60</span><input required maxLength={60} name="title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-2 w-full rounded-lg border p-3 dark:bg-black" /></label>
      <label className="block text-sm font-bold">Message <span className="float-right font-medium text-slate-500">{body.length}/180</span><textarea required maxLength={180} name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="mt-2 w-full rounded-lg border p-3 dark:bg-black" /></label>
      <label className="block text-sm font-bold">Category<select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className="mt-2 w-full rounded-lg border p-3 dark:bg-black">{NOTIFICATION_CATEGORY_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.categories.map((item) => <option key={item} value={item}>{NOTIFICATION_CATEGORY_LABELS[item]}</option>)}</optgroup>)}</select></label>
      <fieldset><legend className="text-sm font-bold">Audience</legend><div className="mt-2 flex flex-wrap gap-4">{["student","parent","staff"].map((audience) => <label key={audience} className="capitalize"><input type="checkbox" name="audiences" value={audience} checked={audiences.includes(audience)} onChange={(e) => setAudiences(e.target.checked ? [...audiences,audience] : audiences.filter((item) => item !== audience))} /> {audience}</label>)}<label><input type="checkbox" name="everyone" checked={audiences.length === 3} onChange={(e) => setAudiences(e.target.checked ? ["student","parent","staff"] : [])} /> Everyone</label></div></fieldset>
      <label className="block text-sm font-bold">Open destination (optional)<input name="destination_url" placeholder="/school/app/announcements" className="mt-2 w-full rounded-lg border p-3 dark:bg-black" /></label>
      <label className="block text-sm font-bold">Schedule in {timezone}<input name="scheduled_for" type="datetime-local" className="mt-2 w-full rounded-lg border p-3 dark:bg-black" /></label>
      <div className="flex flex-wrap gap-3"><button name="intent" value="send" className="rounded-lg bg-[var(--school-primary)] px-5 py-3 font-bold text-[var(--school-primary-text)]" onClick={(e) => { if (category === "emergency" && audiences.length === 3 && !confirm("Send this emergency notification to every registered device?")) e.preventDefault(); }}>Send now</button><button name="intent" value="schedule" className="rounded-lg border px-5 py-3 font-bold">Schedule</button><button name="intent" value="draft" className="rounded-lg border px-5 py-3 font-bold">Save draft</button></div>
    </section>
    <aside><h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Push preview</h2><div className="mt-3 rounded-[2rem] bg-slate-100 p-4 shadow-xl dark:bg-[#333]"><div className="rounded-2xl bg-white p-4 text-slate-950"><p className="text-xs font-bold text-slate-500">Sundial · now</p><p className="mt-2 font-bold">{title || "Notification title"}</p><p className="mt-1 text-sm">{body || "Your message will appear here."}</p></div></div><p className="mt-4 text-sm text-slate-500">The final eligible count is calculated at delivery time using this school, audience, device preferences, and active subscriptions.</p></aside>
  </form>;
}
