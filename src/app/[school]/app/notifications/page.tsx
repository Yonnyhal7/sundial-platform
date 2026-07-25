import type { Metadata } from "next";
import NotificationInbox from "@/components/mobile-app/NotificationInbox";
import { requireMobileAppSchool } from "@/lib/mobileAppData";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params }: { params: Promise<{ school: string }> }) {
  const { school } = await params;
  const schoolData = await requireMobileAppSchool(school);
  return <NotificationInbox school={school} schoolId={schoolData.id} timeZone={schoolData.timezone || "America/Los_Angeles"} initialAudience={null} />;
}
