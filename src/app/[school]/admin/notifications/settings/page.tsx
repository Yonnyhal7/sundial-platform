import { notFound } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { getSchoolForSetup } from "@/lib/schools";
import { saveNotificationSettingsAction } from "../actions";

export default async function NotificationSettings({ params }: { params: Promise<{ school: string }> }) {
  const { school } = await params;
  const schoolData = await getSchoolForSetup(school);
  if (!schoolData) notFound();
  const { supabase } = await requireAdminSectionAccess(schoolData.id, "notifications", school);
  const { data } = await supabase.from("notification_school_settings").select("*").eq("school_id", schoolData.id).single();
  if (!data) notFound();
  return <main className="mx-auto max-w-3xl px-6 py-8 text-slate-950 dark:text-white"><p className="text-sm text-slate-500">{schoolData.name} Admin</p><h1 className="text-3xl font-bold">Notification settings</h1><form action={saveNotificationSettingsAction.bind(null, school, data.version)} className="mt-6 space-y-5 rounded-2xl border bg-white p-6 dark:border-[#3a3a3a] dark:bg-[#242424]"><label className="flex gap-3"><input type="checkbox" name="notifications_enabled" defaultChecked={data.notifications_enabled} /><span><b>Enable notifications</b><small className="block text-slate-500">Allow campaigns and inbox delivery for this school.</small></span></label><label className="flex gap-3"><input type="checkbox" name="scheduled_notifications_enabled" defaultChecked={data.scheduled_notifications_enabled} /><span><b>Enable scheduled notifications</b><small className="block text-slate-500">Allow delivery by the scheduled worker.</small></span></label><label className="block text-sm font-bold">Sender display name<input name="sender_display_name" maxLength={80} defaultValue={data.sender_display_name || ""} className="mt-2 w-full rounded-lg border p-3 dark:bg-black" /></label><p className="text-sm text-slate-500">Emergency behavior: preferences are respected. Critical-alert entitlement is not claimed.</p><button className="rounded-lg bg-[var(--school-primary)] px-5 py-3 font-bold text-[var(--school-primary-text)]">Save settings</button></form></main>;
}
