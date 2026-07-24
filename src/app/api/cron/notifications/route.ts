import { NextResponse } from "next/server";
import { requireCronAuthorization } from "@/lib/notifications/env.server";
import { processNotificationQueue } from "@/lib/notifications/service.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!requireCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await processNotificationQueue());
  } catch {
    return NextResponse.json({ error: "Notification processing unavailable" }, { status: 503 });
  }
}
