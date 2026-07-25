import NotificationDetail from "@/components/mobile-app/NotificationDetail";
import { requireMobileAppSchool } from "@/lib/mobileAppData";

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ school: string; deliveryId: string }>;
}) {
  const { school, deliveryId } = await params;
  const schoolData = await requireMobileAppSchool(school);
  return <NotificationDetail deliveryId={deliveryId} school={school} schoolId={schoolData.id} timeZone={schoolData.timezone || "America/Los_Angeles"} />;
}
