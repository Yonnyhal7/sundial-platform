import { notFound } from "next/navigation";
import NotificationComposer from "@/components/admin/NotificationComposer";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { getSchoolForSetup } from "@/lib/schools";
import { createNotificationCampaignAction } from "../actions";

export default async function NewNotificationPage({ params, searchParams }: { params: Promise<{ school: string }>; searchParams: Promise<{ error?: string }> }) {
  const { school } = await params;
  const schoolData = await getSchoolForSetup(school);
  if (!schoolData) notFound();
  await requireAdminSectionAccess(schoolData.id, "notifications", school);
  const { error } = await searchParams;
  return <main className="mx-auto max-w-6xl px-6 py-8 text-slate-950 dark:text-white"><p className="text-sm text-slate-500">{schoolData.name} Admin</p><h1 className="mb-6 text-3xl font-bold">Create notification</h1><NotificationComposer action={createNotificationCampaignAction.bind(null, school)} timezone={schoolData.timezone || "America/Los_Angeles"} error={error} /></main>;
}
