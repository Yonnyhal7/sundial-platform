import type { Metadata } from "next";
import NotificationDrawerRoute from "@/components/mobile-app/NotificationDrawerRoute";
import { requireMobileAppSchool } from "@/lib/mobileAppData";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params }: { params: Promise<{ school: string }> }) {
  const { school } = await params;
  const schoolData = await requireMobileAppSchool(school);
  return <NotificationDrawerRoute school={school} schoolId={schoolData.id} timeZone={schoolData.timezone || "America/Los_Angeles"} />;
}
