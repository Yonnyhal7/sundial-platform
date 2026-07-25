import NotificationDrawerRoute from "@/components/mobile-app/NotificationDrawerRoute";
import { requireMobileAppSchool } from "@/lib/mobileAppData";

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ school: string; deliveryId: string }>;
}) {
  const { school, deliveryId } = await params;
  const schoolData = await requireMobileAppSchool(school);
  return <NotificationDrawerRoute deliveryId={deliveryId} school={school} schoolId={schoolData.id} timeZone={schoolData.timezone || "America/Los_Angeles"} />;
}
