import { NextResponse } from "next/server";
import { requireCronAuthorization } from "@/lib/notifications/env.server";
import { cleanupNotificationDeviceInbox, processNotificationQueue } from "@/lib/notifications/service.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!requireCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const processing = await processNotificationQueue();
    const cleanup = await cleanupNotificationDeviceInbox();
    return NextResponse.json({ processing, cleanup });
  } catch {
    return NextResponse.json({ error: "Notification processing unavailable" }, { status: 503 });
  }
}
