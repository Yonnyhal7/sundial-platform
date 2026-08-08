import { NextResponse } from "next/server";
import { requireCronAuthorization } from "@/lib/notifications/env.server";
import {
  cleanupNotificationDeviceInbox,
  processNotificationQueue,
} from "@/lib/notifications/service.server";
import { processAutomaticPeriodReminders } from "@/lib/notifications/periodReminderService.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!requireCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const periodReminders = await processAutomaticPeriodReminders().catch(() => {
      console.error(JSON.stringify({ scope: "period_reminder_processor", event: "processor_failed" }));
      return { schools: 0, processed: 0, failed: 1 };
    });
    const processing = await processNotificationQueue();
    const cleanup = await cleanupNotificationDeviceInbox();
    return NextResponse.json({ processing, periodReminders, cleanup });
  } catch {
    return NextResponse.json(
      { error: "Notification processing unavailable" },
      { status: 503 },
    );
  }
}
