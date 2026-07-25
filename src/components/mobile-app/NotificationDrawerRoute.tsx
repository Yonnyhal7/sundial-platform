"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import NotificationDrawer from "@/components/mobile-app/NotificationDrawer";

export default function NotificationDrawerRoute({
  school,
  schoolId,
  timeZone,
  deliveryId,
}: {
  school: string;
  schoolId: string;
  timeZone: string;
  deliveryId?: string;
}) {
  const router = useRouter();
  const close = useCallback(() => router.replace(`/${school}/app`), [router, school]);

  return (
    <NotificationDrawer
      open
      onClose={close}
      school={school}
      schoolId={schoolId}
      timeZone={timeZone}
      initialDeliveryId={deliveryId}
      historyDismiss={false}
    />
  );
}
